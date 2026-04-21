import { createClient } from "@supabase/supabase-js";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function syncShopifyData(supabase: any, send: (data: any) => void, full: boolean = false) {
  const report = {
    orders: { synced: 0, skipped: 0 },
    abandoned: { synced: 0, skipped: 0 },
    customers: { updated: 0 },
    tasks: { created: 0 },
    errors: [] as string[]
  };

  try {
    send({ progress: 10, message: `Shopify ${full ? "FULL " : ""}Sync: Connecting...` });
    const settings = await getSystemSettings(supabase);
    if (!settings?.shopify_store_domain) {
      throw new Error("Shopify domain not configured");
    }

    const domain = String(settings.shopify_store_domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token = await getShopifyAccessToken(supabase);

    const commonHeaders = {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    };

    // 1. FETCH ORDERS
    send({ progress: 15, message: `Shopify Sync: Fetching ${full ? "COMPLETE " : "recent "}orders...` });
    let ordersUrl: string | null = `https://${domain}/admin/api/2024-04/orders.json?status=any&limit=250`;
    let ordersPage = 1;
    const MAX_SHALLOW_PAGES = 4;

    while (ordersUrl) {
      if (!full && ordersPage > MAX_SHALLOW_PAGES) break;

      let ordersRes = await fetch(ordersUrl, { headers: commonHeaders });
      
      // Handle Rate Limiting (429)
      if (ordersRes.status === 429) {
          send({ message: "Shopify Speed Limit Hit. Waiting 5s..." });
          await sleep(5000);
          ordersRes = await fetch(ordersUrl, { headers: commonHeaders });
      }

      const { orders } = await ordersRes.json().catch(() => ({ orders: [] }));
      
      if (!orders || orders.length === 0) break;

      send({ progress: Math.min(35, 15 + (ordersPage * 2)), message: `Shopify Sync: Processing order batch ${ordersPage}...` });

      // 2. PROCESS ORDERS
      for (const order of orders) {
        try {
          const customerData = order.customer;
          const rawPhone = order.phone || customerData?.phone || order.shipping_address?.phone || order.billing_address?.phone || "";
          const phone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");

          if (!phone || phone.length < 7) {
            report.orders.skipped++;
            continue;
          }

          // Step A: Upsert Customer
          const { data: customerArr } = await supabase.from("customers").upsert({
            name: `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim() || "Shopify Customer",
            phone: phone,
            email: order.email || customerData?.email || null,
            shopify_customer_id: customerData?.id ? String(customerData.id) : null,
            address: order.shipping_address?.address1 || null,
            city: order.shipping_address?.city || null,
            state: order.shipping_address?.province || null,
            zip: order.shipping_address?.zip || null,
          }, { onConflict: "phone" }).select("id, total_orders, rto_flag");

          const customer = customerArr?.[0];
          if (!customer) continue;

          // Step B: Upsert Order (with Authority Check)
          const lineItems = (order.line_items || []).map((item: any) => ({
            name: item.name,
            qty: item.quantity,
            price: parseFloat(item.price),
            product_id: String(item.product_id),
            title: item.title
          }));

          const orderNumber = String(order.order_number || order.name);
          const shopifyId = String(order.id);

          const { data: existingOrder } = await supabase
            .from("orders")
            .select("id, delivery_status, source, shopify_order_id")
            .or(`shopify_order_id.eq.${shopifyId},order_number.eq.${orderNumber}`)
            .maybeSingle();

          const currentStatus = order.fulfillment_status === "fulfilled" ? "in_transit" : "pending";
          const statusToSave = (existingOrder && existingOrder.source === "shiprocket" && existingOrder.delivery_status !== "pending")
            ? existingOrder.delivery_status 
            : currentStatus;

          const upsertData: any = {
            customer_id: customer.id,
            shopify_order_id: shopifyId,
            order_number: orderNumber,
            line_items: lineItems,
            total_price: parseFloat(order.total_price || 0),
            fulfillment_status: order.fulfillment_status || "unfulfilled",
            delivery_status: statusToSave,
            ordered_at: order.created_at,
            source: existingOrder?.source || "shopify",
          };

          if (existingOrder) {
            upsertData.id = existingOrder.id;
          }

          await supabase.from("orders").upsert(upsertData, { 
            onConflict: "shopify_order_id",
            ignoreDuplicates: false 
          });
          report.orders.synced++;
          
          await supabase.from("abandoned_carts").update({ recovery_status: "recovered" }).eq("phone", phone).eq("recovery_status", "pending");
          
        } catch (e: any) {
          report.errors.push(`Order ${order.id}: ${e.message}`);
        }
      }

      // Pagination handling
      const linkHeader = ordersRes.headers.get("Link");
      ordersUrl = null;
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) ordersUrl = nextMatch[1];
      }
      ordersPage++;
    }

    // 3. FETCH ABANDONED CHECKOUTS
    send({ progress: 40, message: `Shopify Sync: Fetching ${full ? "COMPLETE " : "recent "}checkouts...` });
    let checkoutsUrl: string | null = `https://${domain}/admin/api/2024-04/checkouts.json?limit=250`;
    let checkoutsPage = 1;

    while (checkoutsUrl) {
      if (!full && checkoutsPage > MAX_SHALLOW_PAGES) break;

      let checkoutsRes = await fetch(checkoutsUrl, { headers: commonHeaders });

      // Handle Rate Limiting (429)
      if (checkoutsRes.status === 429) {
          send({ message: "Shopify Speed Limit Hit (Checkouts). Waiting 5s..." });
          await sleep(5000);
          checkoutsRes = await fetch(checkoutsUrl, { headers: commonHeaders });
      }

      const { checkouts } = await checkoutsRes.json().catch(() => ({ checkouts: [] }));

      if (!checkouts || checkouts.length === 0) break;

      send({ progress: Math.min(85, 40 + (checkoutsPage * 5)), message: `Shopify Sync: Processing checkout batch ${checkoutsPage}...` });

      for (const cart of checkouts) {
        try {
          const cartCustomer = cart.customer;
          const rawPhone = cart.phone || cartCustomer?.phone || cart.shipping_address?.phone || cart.billing_address?.phone || "";
          const phone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");

          const identityPhone = phone || `GUEST-${cart.id}`;
          const { data: customerArr } = await supabase.from("customers").upsert({
            name: `${cartCustomer?.first_name || ""} ${cartCustomer?.last_name || ""}`.trim() || (phone ? "Shopify Customer" : "Checkout Guest"),
            phone: identityPhone,
            email: cart.email || cartCustomer?.email || null,
          }, { onConflict: "phone" }).select("id, total_orders, rto_flag");

          const customer = customerArr?.[0];
          if (!customer) continue;

          const { data: dbCartArr } = await supabase.from("abandoned_carts").upsert({
            customer_id: customer.id,
            shopify_cart_id: String(cart.id),
            cart_token: String(cart.token || cart.id),
            phone: phone,
            email: cart.email || null,
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
            report.tasks.created++;
          }
        } catch (e: any) {
          report.errors.push(`Checkout ${cart.id}: ${e.message}`);
        }
      }

      // Pagination handling
      const linkHeader = checkoutsRes.headers.get("Link");
      checkoutsUrl = null;
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) checkoutsUrl = nextMatch[1];
      }
      checkoutsPage++;
    }

    return report;
  } catch (e: any) {
    report.errors.push(`Global Sync Shopify: ${e.message}`);
    return report;
  }
}
