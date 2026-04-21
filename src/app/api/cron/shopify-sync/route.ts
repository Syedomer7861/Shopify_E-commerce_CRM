import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { isPhoneMasked } from "@/lib/utils";

export async function GET(req: NextRequest) {
  // CRON Security Check
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Check for x-cron-secret used by some other routes in this app
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const report = {
    orders: { synced: 0, skipped: 0 },
    abandoned: { synced: 0, skipped: 0 },
    customers: { updated: 0 },
    tasks: { created: 0 }
  };

  try {
    const settings = await getSystemSettings(supabase);
    if (!settings?.shopify_store_domain || !settings?.shopify_api_key) {
      return NextResponse.json({ success: false, error: "Shopify not configured" });
    }

    const domain = String(settings.shopify_store_domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token = await getShopifyAccessToken(supabase);

    const commonHeaders = {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    };

    // 1. FETCH RECENT ORDERS (last 60 mins for a 15 min cron to be safe)
    const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const ordersUrl = `https://${domain}/admin/api/2024-04/orders.json?status=any&limit=50&created_at_min=${sixtyMinsAgo}`;
    const checkoutsUrl = `https://${domain}/admin/api/2024-04/checkouts.json?limit=50&updated_at_min=${sixtyMinsAgo}`;

    const [ordersRes, checkoutsRes] = await Promise.all([
      fetch(ordersUrl, { headers: commonHeaders }),
      fetch(checkoutsUrl, { headers: commonHeaders })
    ]);

    const { orders } = await ordersRes.json().catch(() => ({ orders: [] }));
    const { checkouts } = await checkoutsRes.json().catch(() => ({ checkouts: [] }));

    // 2. PROCESS ORDERS (Prioritize Shopify Data)
    if (orders && Array.isArray(orders)) {
      for (const order of orders) {
        const customerData = order.customer;
        const rawPhone = order.phone || customerData?.phone || order.shipping_address?.phone || "";
        const phone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");

        if (!phone || isPhoneMasked(phone)) {
          report.orders.skipped++;
          continue;
        }

        // Upsert Customer (SHOPIFY ALWAYS WINS/OVERWRITES)
        const { data: customerArr } = await supabase.from("customers").upsert({
          name: `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim() || "Shopify Customer",
          phone: phone,
          email: order.email || customerData?.email || null,
          shopify_customer_id: customerData?.id ? String(customerData.id) : null,
          city: order.shipping_address?.city || null,
          state: order.shipping_address?.province || null,
          zip: order.shipping_address?.zip || null,
        }, { onConflict: "phone" }).select("id, total_orders, rto_flag");

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
            customer_id: customer.id,
            shopify_order_id: String(order.id),
            order_number: String(order.order_number || order.name),
            line_items: lineItems,
            total_price: parseFloat(order.total_price || 0),
            fulfillment_status: order.fulfillment_status || "unfulfilled",
            delivery_status: order.fulfillment_status === "fulfilled" ? "delivered" : "pending",
            ordered_at: order.created_at,
            source: "shopify",
          }, { onConflict: "shopify_order_id" });

          if (!orderErr) report.orders.synced++;
        }
      }
    }

    // 3. PROCESS ABANDONED CHECKOUTS
    if (checkouts && Array.isArray(checkouts)) {
      for (const cart of checkouts) {
        const cartCustomer = cart.customer;
        const rawPhone = cart.phone || cartCustomer?.phone || cart.shipping_address?.phone || "";
        const phone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");

        if (!phone || isPhoneMasked(phone)) {
          report.abandoned.skipped++;
          continue;
        }

        const { data: customerArr } = await supabase.from("customers").upsert({
          name: `${cartCustomer?.first_name || ""} ${cartCustomer?.last_name || ""}`.trim() || "Checkout Guest",
          phone: phone,
          email: cart.email || cartCustomer?.email || null,
        }, { onConflict: "phone" }).select("id, total_orders, rto_flag");

        const customer = customerArr?.[0];
        if (customer) {
          const { data: dbCartArr } = await supabase.from("abandoned_carts").upsert({
            customer_id: customer.id,
            shopify_cart_id: String(cart.id),
            cart_token: String(cart.token || cart.id),
            phone: phone,
            total_price: parseFloat(cart.total_price || 0),
            line_items: cart.line_items || [],
            recovery_status: "pending",
            abandoned_at: cart.updated_at || cart.created_at,
          }, { onConflict: "cart_token" }).select("id");

          const dbCart = dbCartArr?.[0];
          if (dbCart) {
            report.abandoned.synced++;
            const recoveryDate = new Date(cart.updated_at || cart.created_at);
            recoveryDate.setHours(recoveryDate.getHours() + (settings.recovery_delay_hours || 24));

            await supabase.from("tasks").upsert({
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
    }

    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
