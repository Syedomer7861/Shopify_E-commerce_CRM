import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";
import { WorkflowEngine } from "@/lib/workflow-engine";
import { requireInternal } from "@/lib/auth-utils";
import { makeDeadline } from "@/lib/sync-logic";
import { mapShiprocketStatus } from "@/lib/shiprocket-status";

// Vercel Hobby caps functions at 60s; a higher value fails the deploy.
// On Pro this can go to 300. The syncs are incremental, so a cut-off run
// resumes on the next tick.
export const maxDuration = 60;

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

// The /orders/show fix below (see the comment further down) surfaces a
// backlog of months-stale statuses in one go. Firing the normal workflows
// for every one of them would send real customers "please review your
// order" for a delivery from months ago and flood agents with "Urgent RTO
// Escalation" tasks for RTOs that already happened and were long since
// handled some other way. Only fire workflows for events actually recent
// enough to be real news; older ones still get the correct status, just
// quietly.
const STALE_EVENT_DAYS = 7;

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  try {
    const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
    const results = [];
    for (const org of orgs ?? []) {
      results.push({ orgId: org.id, ...(await syncOrgOrders(supabase, org.id)) });
    }
    return NextResponse.json({ orgs: results });
  } catch (err: any) {
    console.error("🚀 Shiprocket Sync Cron Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function syncOrgOrders(supabase: any, orgId: string) {
  try {
    const settings = await getSystemSettings(supabase, orgId);
    if (!settings?.shiprocket_email || !settings?.shiprocket_password) {
      return { skipped: true, reason: "Shiprocket credentials not configured" };
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
    //
    // Orders with no tracking_number haven't shipped yet - Shiprocket has
    // nothing to report on them, so they're excluded rather than wasting a
    // call that can only ever come back empty.
    const BATCH_LIMIT = 300;
    const { data: activeOrders, error: orderErr } = await supabase
      .from("orders")
      .select("id, shopify_order_id, tracking_number, delivery_status, customer_id")
      .in("delivery_status", ["pending", "in_transit", "out_for_delivery"])
      .not("tracking_number", "is", null)
      .eq("org_id", orgId)
      .order("updated_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (orderErr) throw orderErr;
    if (!activeOrders || activeOrders.length === 0) {
      return { processed: 0, message: "No active orders to sync" };
    }

    console.log(`🔄 Shiprocket Cron: Syncing ${activeOrders.length} active orders...`);

    let updatedCount = 0;
    let truncated = false;
    // cron-job.org's free tier hard-caps its own wait at 30s (confirmed
    // live - "The maximum timeout is 30 seconds", no way to raise it) -
    // well under Vercel's 60s ceiling this budget was originally sized
    // for. 20s leaves real margin for Shiprocket auth + Vercel cold start
    // overhead (observed ~2-8s beyond the deadline itself) so the route
    // always finishes and replies before the caller gives up. Same
    // resumable design either way - a smaller budget just means more
    // hourly runs to work through a big backlog, not a functional change.
    const deadline = makeDeadline({ budgetMs: 20_000 });

    // 3. Sync each order
    for (const order of activeOrders) {
      if (deadline.expired()) { truncated = true; break; }
      try {
        // /orders/show/{id} takes Shiprocket's OWN internal order id, not
        // the channel (Shopify) order id stored in shopify_order_id - and
        // that internal id is never persisted anywhere in this schema, so
        // there was no way to call it correctly. Confirmed live: every call
        // 404'd ("record not found"), silently swallowed by the old `if
        // (!res.ok) continue`, so this sync had done nothing for months -
        // orders checked this way were still reading "in_transit" while
        // Shiprocket's own tracking showed them Delivered weeks/months
        // earlier. Tracking by AWB instead needs no internal id at all.
        const res = await fetch(`${SHIPROCKET_BASE_URL}/courier/track/awb/${order.tracking_number}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if (!res.ok) continue;
        const { tracking_data } = await res.json();
        const srOrder = tracking_data?.shipment_track?.[0];
        if (!srOrder) continue;

        const newStatus = mapShiprocketStatus(srOrder.current_status || "");

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

          const eventTimeRaw = srOrder.updated_time_stamp || srOrder.delivered_date || srOrder.pickup_date;
          const eventTime = eventTimeRaw ? new Date(String(eventTimeRaw).replace(" ", "T")) : null;
          const isStaleBackfill = !eventTime || isNaN(eventTime.getTime())
            ? false
            : Date.now() - eventTime.getTime() > STALE_EVENT_DAYS * 86_400_000;

          // Trigger WorkflowEngine - but only for events recent enough to be
          // real news (see STALE_EVENT_DAYS comment above).
          if (!isStaleBackfill) {
            if (newStatus === "delivered") {
              await WorkflowEngine.trigger("order_delivered", { order_id: order.id, customer_id: order.customer_id });
            } else if (newStatus === "rto") {
              await WorkflowEngine.trigger("order_rto", { order_id: order.id, customer_id: order.customer_id });
            } else if (newStatus === "in_transit") {
              await WorkflowEngine.trigger("order_in_transit", { order_id: order.id, customer_id: order.customer_id });
            }
          }
        }
      } catch (err) {
        console.error(`❌ Failed to sync SR order ${order.shopify_order_id}:`, err);
      }
    }

    return {
      processed: activeOrders.length,
      updated: updatedCount,
      truncated,
    };

  } catch (err: any) {
    console.error(`🚀 Shiprocket Sync Cron Error (org ${orgId}):`, err.message);
    return { error: err.message };
  }
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
