// Robust Standalone script for Deep Shopify Sync with Task Recognition
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Assign Task Owner (Simplified)
async function getTaskOwner() {
    const { data: agents } = await supabase.from("profiles").select("id").eq("role", "agent");
    if (agents && agents.length > 0) {
        return agents[Math.floor(Math.random() * agents.length)].id;
    }
    const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin").limit(1);
    return admins?.[0]?.id || null;
}

// Helper: Calculate Priority (Simplified)
function getPriority(totalPrice, totalOrders, rtoFlag) {
    let score = 50;
    if (totalPrice > 2000) score += 20;
    if (totalOrders > 0) score += 15;
    if (rtoFlag) score -= 30;
    return Math.max(0, Math.min(100, score));
}

async function deepSync() {
  console.log("🚀 Starting COMPLETE DEEP Shopify Sync (Carts + Orders + Tasks)...");
  
  try {
    const { data: settings } = await supabase.from('settings').select('*').single();
    const domain = settings.shopify_store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token = settings.shopify_access_token;
    const taskOwner = await getTaskOwner();

    const commonHeaders = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

    // 1. ABANDONED CHECKOUTS
    console.log("\n🛒 [PHASE 1] Fetching Historical Abandoned Checkouts...");
    let checkoutsUrl = `https://${domain}/admin/api/2024-04/checkouts.json?limit=250`;
    let totalCarts = 0;

    while (checkoutsUrl) {
       let res = await fetch(checkoutsUrl, { headers: commonHeaders });
       if (res.status === 429) { await sleep(10000); continue; }

       const { checkouts } = await res.json().catch(() => ({ checkouts: [] }));
       if (!checkouts || checkouts.length === 0) break;

       for (const cart of checkouts) {
          try {
              const cartCustomer = cart.customer;
              const rawPhone = cart.phone || cartCustomer?.phone || cart.shipping_address?.phone || cart.billing_address?.phone || "";
              const phone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");
              const identityPhone = phone || `GUEST-${cart.id}`;

              const { data: custArr } = await supabase.from("customers").upsert({
                name: `${cartCustomer?.first_name || ""} ${cartCustomer?.last_name || ""}`.trim() || (phone ? "Shopify Customer" : "Checkout Guest"),
                phone: identityPhone,
                email: cart.email || cartCustomer?.email || null,
              }, { onConflict: "phone" }).select("id, total_orders, rto_flag");

              const customer = custArr?.[0];
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
                // CREATE TASK
                const recoveryDate = new Date(cart.updated_at || cart.created_at);
                recoveryDate.setHours(recoveryDate.getHours() + (settings.recovery_delay_hours || 24));

                await supabase.from("tasks").upsert({
                  abandoned_cart_id: dbCart.id,
                  customer_id: customer.id,
                  task_type: "recovery",
                  due_date: recoveryDate.toISOString().split("T")[0],
                  status: "pending",
                  assigned_to: taskOwner,
                  priority_score: getPriority(parseFloat(cart.total_price), customer.total_orders, customer.rto_flag)
                }, { onConflict: "abandoned_cart_id, task_type" });
                totalCarts++;
              }
          } catch (e) {
              console.error(`Error cart ${cart.id}:`, e.message);
          }
       }
       console.log(`📈 Carts Synced: ${totalCarts}`);
       const link = res.headers.get("Link");
       checkoutsUrl = null;
       if (link) {
         const match = link.match(/<([^>]+)>;\s*rel="next"/);
         if (match) checkoutsUrl = match[1];
       }
       await sleep(300);
    }

    // 2. ORDERS
    console.log("\n📦 [PHASE 2] Fetching Orders...");
    let ordersUrl = `https://${domain}/admin/api/2024-04/orders.json?status=any&limit=250`;
    let totalOrders = 0;

    while (ordersUrl) {
      let res = await fetch(ordersUrl, { headers: commonHeaders });
      if (res.status === 429) { await sleep(10000); continue; }
      const { orders } = await res.json().catch(() => ({ orders: [] }));
      if (!orders || orders.length === 0) break;

      for (const order of orders) {
        try {
            const customerData = order.customer;
            const rawPhone = order.phone || customerData?.phone || order.shipping_address?.phone || order.billing_address?.phone || "";
            const phone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");
            if (!phone || phone.length < 7) continue;

            const { data: custArr } = await supabase.from("customers").upsert({
              name: `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim() || "Shopify Customer",
              phone: phone,
              email: order.email || customerData?.email || null,
              shopify_customer_id: customerData?.id ? String(customerData.id) : null,
            }, { onConflict: "phone" }).select("id");

            if (!custArr?.[0]) continue;
            const cid = custArr[0].id;

            await supabase.from("orders").upsert({
              customer_id: cid,
              shopify_order_id: String(order.id),
              order_number: String(order.order_number || order.name),
              total_price: parseFloat(order.total_price || 0),
              fulfillment_status: order.fulfillment_status || "unfulfilled",
              delivery_status: (order.fulfillment_status === "fulfilled" ? "in_transit" : "pending"),
              ordered_at: order.created_at,
              source: "shopify",
            }, { onConflict: "shopify_order_id" });
            totalOrders++;
        } catch (e) {
            console.error(`Error order ${order.id}:`, e.message);
        }
      }
      console.log(`📈 Orders Synced: ${totalOrders}`);
      const link = res.headers.get("Link");
      ordersUrl = null;
      if (link) {
        const match = link.match(/<([^>]+)>;\s*rel="next"/);
        if (match) ordersUrl = match[1];
      }
      await sleep(300);
    }

    console.log("🏁 SYNC COMPLETE!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed:", err);
    process.exit(1);
  }
}

deepSync();
