import { NextRequest, NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { isPhoneMasked } from "@/lib/utils";
import { normalizePhone } from "@/lib/phone-utils";

export async function GET(req: NextRequest) {
  const unauthorized = await requirePrivileged(req, ["manage_automations"]);
  if (unauthorized) return unauthorized;

  // CRON Security Check
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Check for x-cron-secret used by some other routes in this app
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();

  const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
  const reports: any[] = [];
  for (const org of orgs ?? []) {
    reports.push({ orgId: org.id, ...(await syncOrg(supabase, org.id)) });
  }
  return NextResponse.json({ success: true, reports });
}

async function syncOrg(supabase: any, orgId: string) {
  const report = {
    orders: { synced: 0, skipped: 0 },
    abandoned: { synced: 0, skipped: 0 },
    customers: { updated: 0 },
    tasks: { created: 0 }
  };

  try {
    const settings = await getSystemSettings(supabase, orgId);
    if (!settings?.shopify_store_domain || !settings?.shopify_api_key) {
      return { success: false, error: "Shopify not configured" };
    }

    const domain = String(settings.shopify_store_domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token = await getShopifyAccessToken(supabase, orgId);

    const commonHeaders = {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    };

    // 1. FETCH RECENT ORDERS & CHECKOUTS
    // Normal: 3 hours lookback
    // Daily Deep Audit (2 AM - 3 AM): 24 hours lookback to catch any stragglers
    const now = new Date();
    const isAuditWindow = now.getHours() === 2; // Run deep audit during 2 AM hour
    const lookbackHours = isAuditWindow ? 24 : 3;
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
    
    console.log(`[ShopifySync] Starting ${isAuditWindow ? "DEEP AUDIT" : "INCREMENTAL"} sync (lookback: ${lookbackHours}h)`);

    // -- A. PROCESS ORDERS --
    let ordersUrl: string | null = `https://${domain}/admin/api/2024-04/orders.json?status=any&limit=250&updated_at_min=${since}`;
    
    while (ordersUrl) {
      const ordersRes: Response = await fetch(ordersUrl, { headers: commonHeaders });
      if (!ordersRes.ok) break;
      
      const { orders } = await ordersRes.json().catch(() => ({ orders: [] }));
      if (!orders || !Array.isArray(orders) || orders.length === 0) break;

      for (const order of orders) {
        const customerData = order.customer;
        const rawPhone = order.phone || customerData?.phone || order.shipping_address?.phone || "";
        const phone = normalizePhone(rawPhone);

        if (!phone || isPhoneMasked(phone)) {
          report.orders.skipped++;
          continue;
        }

        // Upsert Customer
        const { data: customerArr } = await supabase.from("customers").upsert({
          org_id: orgId,
          name: `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim() || "Shopify Customer",
          phone: phone,
          email: order.email || customerData?.email || null,
          shopify_customer_id: customerData?.id ? String(customerData.id) : null,
          city: order.shipping_address?.city || null,
          state: order.shipping_address?.province || null,
          zip: order.shipping_address?.zip || null,
        }, { onConflict: "org_id,phone" }).select("id, total_orders, rto_flag");

        const customer = customerArr?.[0];
        if (customer) {
          const lineItems = (order.line_items || []).map((item: any) => ({
            name: item.name,
            qty: item.quantity,
            price: parseFloat(item.price),
            product_id: String(item.product_id),
            title: item.title
          }));

          const { error: orderErr } = await supabase.from("orders").upsert({
            org_id: orgId,
            customer_id: customer.id,
            shopify_order_id: String(order.id),
            order_number: String(order.order_number || order.name),
            line_items: lineItems,
            total_price: parseFloat(order.total_price || 0),
            fulfillment_status: order.fulfillment_status || "unfulfilled",
            // Same false-premise bug fixed in sync-logic.ts and webhooks/
            // shopify - fulfillment_status isn't a real delivery
            // confirmation. This route isn't currently scheduled (not in
            // cron.yml or vercel.json) but leaving the same landmine here
            // would just recreate the bug the moment someone wires it up.
            delivery_status: "pending",
            ordered_at: order.created_at,
            source: "shopify",
          }, { onConflict: "org_id,shopify_order_id" });

          if (!orderErr) report.orders.synced++;
        }
      }

      // Handle Pagination
      const linkHeader = ordersRes.headers.get("Link");
      ordersUrl = null;
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) ordersUrl = nextMatch[1];
      }
    }

    // -- B. PROCESS ABANDONED CHECKOUTS --
    let checkoutsUrl: string | null = `https://${domain}/admin/api/2024-04/checkouts.json?limit=250&updated_at_min=${since}`;

    while (checkoutsUrl) {
      const checkoutsRes: Response = await fetch(checkoutsUrl, { headers: commonHeaders });
      if (!checkoutsRes.ok) break;

      const { checkouts } = await checkoutsRes.json().catch(() => ({ checkouts: [] }));
      if (!checkouts || !Array.isArray(checkouts) || checkouts.length === 0) break;

      for (const cart of checkouts) {
        const cartCustomer = cart.customer;
        const rawPhone = cart.phone || cartCustomer?.phone || cart.shipping_address?.phone || "";
        const phone = normalizePhone(rawPhone);

        if (!phone || isPhoneMasked(phone)) {
          report.abandoned.skipped++;
          continue;
        }

        const { data: customerArr } = await supabase.from("customers").upsert({
          org_id: orgId,
          name: `${cartCustomer?.first_name || ""} ${cartCustomer?.last_name || ""}`.trim() || "Checkout Guest",
          phone: phone,
          email: cart.email || cartCustomer?.email || null,
        }, { onConflict: "org_id,phone" }).select("id, total_orders, rto_flag");

        const customer = customerArr?.[0];
        if (customer) {
          // STALENESS GUARD: Skip carts abandoned more than 7 days ago
          const cartCreatedAt = new Date(cart.created_at);
          const ageInDays = (Date.now() - cartCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (ageInDays > 7) {
            report.abandoned.skipped++;
            continue;
          }

          const { data: dbCartArr } = await supabase.from("abandoned_carts").upsert({
            org_id: orgId,
            customer_id: customer.id,
            cart_token: String(cart.token || cart.id),
            phone: phone,
            total_price: parseFloat(cart.total_price || 0),
            line_items: cart.line_items || [],
            recovery_status: "pending",
            abandoned_at: cart.updated_at || cart.created_at,
          }, { onConflict: "org_id,cart_token" }).select("id");

          const dbCart = dbCartArr?.[0];
          if (dbCart) {
            report.abandoned.synced++;
            
            // 1. STATUS LOCK: Check if a recovery task already exists and is finished
            const { data: existingTask } = await supabase
              .from("tasks")
              .select("status")
              .eq("abandoned_cart_id", dbCart.id)
              .eq("task_type", "recovery")
              .maybeSingle();

            if (existingTask && (existingTask.status === "done" || existingTask.status === "cancelled")) {
               continue; // Prevent re-opening completed recovery tasks
            }

            const recoveryDate = new Date(cart.updated_at || cart.created_at);
            recoveryDate.setHours(recoveryDate.getHours() + (settings.recovery_delay_hours || 24));

            await supabase.from("tasks").upsert({
              org_id: orgId,
              abandoned_cart_id: dbCart.id,
              customer_id: customer.id,
              task_type: "recovery",
              due_date: recoveryDate.toISOString().split("T")[0],
              status: "pending",
              assigned_to: await assignTaskOwner(supabase),
              priority_score: calculateTaskPriority({
                taskType: "recovery",
                totalPrice: parseFloat(cart.total_price),
                totalOrders: customer.total_orders,
                rtoFlag: customer.rto_flag
              })
            }, { onConflict: "abandoned_cart_id, task_type" });
          }
        }
      }

      // Handle Pagination
      const linkHeader = checkoutsRes.headers.get("Link");
      checkoutsUrl = null;
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) checkoutsUrl = nextMatch[1];
      }
    }

    // 3. LOG RESULTS
    await supabase.from("webhook_logs").insert({
      org_id: orgId,
      source: "system_sync",
      topic: isAuditWindow ? "shopify_deep_audit" : "shopify_incremental_sync",
      payload: report,
      status: "processed"
    });

    return { success: true, report };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
