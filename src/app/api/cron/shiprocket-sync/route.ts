import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";
import { WorkflowEngine } from "@/lib/workflow-engine";
import { requireInternal } from "@/lib/auth-utils";
import { makeDeadline } from "@/lib/sync-logic";

// Vercel Hobby caps functions at 60s; a higher value fails the deploy.
// On Pro this can go to 300. The syncs are incremental, so a cut-off run
// resumes on the next tick.
export const maxDuration = 60;

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

function mapShiprocketStatus(status: string | number) {
  const s = String(status).toLowerCase();
  if (s.includes("delivered") || s === "7" || s === "10") return "delivered";
  if (s.includes("shipped") || s === "6" || s === "12" || s.includes("transit")) return "in_transit";
  if (s.includes("out for delivery") || s === "13") return "out_for_delivery";
  if (s.includes("rto") || s === "9") return "rto";
  if (s.includes("canceled") || s === "8" || s.includes("cancel")) return "failed";
  return "pending";
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  try {
    const settings = await getSystemSettings(supabase);
    if (!settings?.shiprocket_email || !settings?.shiprocket_password) {
      return NextResponse.json({ error: "Shiprocket credentials not configured" }, { status: 400 });
    }

    // 1. Authenticate with Shiprocket
    const authRes = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        email: settings.shiprocket_email.trim(), 
        password: settings.shiprocket_password.trim() 
      })
    });

    if (!authRes.ok) throw new Error("Shiprocket Auth Failed");
    const { token } = await authRes.json();

    // 2. Fetch Active Orders from CRM (Pending or In Transit)
    // This makes one sequential external Shiprocket API call per order - with
    // hundreds of active orders that alone exceeds Vercel's 60s cap on every
    // run (confirmed: this endpoint runs alone, nothing else chained, and
    // still timed out repeatedly). Oldest-updated first + a per-run cap +
    // a deadline bail means an oversized backlog is worked off incrementally
    // across the hourly cron runs instead of restarting from scratch and
    // never finishing.
    const BATCH_LIMIT = 300;
    const { data: activeOrders, error: orderErr } = await supabase
      .from("orders")
      .select("id, shopify_order_id, delivery_status, customer_id")
      .in("delivery_status", ["pending", "in_transit", "out_for_delivery"])
      .order("updated_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (orderErr) throw orderErr;
    if (!activeOrders || activeOrders.length === 0) {
      return NextResponse.json({ processed: 0, message: "No active orders to sync" });
    }

    console.log(`🔄 Shiprocket Cron: Syncing ${activeOrders.length} active orders...`);

    let updatedCount = 0;
    let truncated = false;
    const deadline = makeDeadline({ budgetMs: 45_000 });

    // 3. Sync each order
    for (const order of activeOrders) {
      if (deadline.expired()) { truncated = true; break; }
      try {
        // Fetch specific order status from Shiprocket
        const res = await fetch(`${SHIPROCKET_BASE_URL}/orders/show/${order.shopify_order_id}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if (!res.ok) continue;
        const { data: srOrder } = await res.json();
        if (!srOrder) continue;

        const newStatus = mapShiprocketStatus(srOrder.status || "");

        // If status changed, update and trigger workflow
        if (newStatus !== order.delivery_status) {
          const updateData: any = { 
            delivery_status: newStatus,
            updated_at: new Date().toISOString()
          };
          if (newStatus === "delivered") {
            updateData.delivered_at = srOrder.delivered_date || new Date().toISOString();
          }

          await supabase.from("orders").update(updateData).eq("id", order.id);
          updatedCount++;

          // Trigger WorkflowEngine
          if (newStatus === "delivered") {
            await WorkflowEngine.trigger("order_delivered", { order_id: order.id, customer_id: order.customer_id });
          } else if (newStatus === "rto") {
            await WorkflowEngine.trigger("order_rto", { order_id: order.id, customer_id: order.customer_id });
          } else if (newStatus === "in_transit") {
            await WorkflowEngine.trigger("order_in_transit", { order_id: order.id, customer_id: order.customer_id });
          }
        }
      } catch (err) {
        console.error(`❌ Failed to sync SR order ${order.shopify_order_id}:`, err);
      }
    }

    return NextResponse.json({
      processed: activeOrders.length,
      updated: updatedCount,
      truncated,
    });

  } catch (err: any) {
    console.error("🚀 Shiprocket Sync Cron Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
