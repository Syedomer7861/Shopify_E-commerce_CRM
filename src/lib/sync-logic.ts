import { createClient } from "@supabase/supabase-js";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { resolveUnmaskedPhone } from "./unmask-utils";

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
    const MAX_SHALLOW_PAGES = 1;

    while (ordersUrl) {
      if (!full && ordersPage > MAX_SHALLOW_PAGES) break;

      let ordersRes: Response = await fetch(ordersUrl, { headers: commonHeaders, cache: 'no-store' });
      
      // Handle Rate Limiting (429)
      if (ordersRes.status === 429) {
          send({ message: "Shopify Speed Limit Hit. Waiting 5s..." });
          await sleep(5000);
          ordersRes = await fetch(ordersUrl, { headers: commonHeaders, cache: 'no-store' });
      }

      const { orders } = await ordersRes.json().catch(() => ({ orders: [] }));
      
      if (!orders || orders.length === 0) break;

      send({ progress: Math.min(35, 15 + (ordersPage * 2)), message: `Shopify Sync: Processing order batch ${ordersPage}...` });

      // 2. PROCESS ORDERS
      const affectedCustomerIds = new Set<string>();
      for (const order of orders) {
        try {
          const customerData = order.customer;
          const rawPhone = order.phone || customerData?.phone || order.shipping_address?.phone || order.billing_address?.phone || "";
          let phone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");

          const isMasked = !phone || phone.includes("x") || phone.includes("X") || phone.length < 7;
          const shopifyId = String(order.id);

          // 🕵️ EXTRA EFFORT: Try to unmask/resolve phone
          if (isMasked) {
              const email = order.email || customerData?.email || null;
              const resolved = await resolveUnmaskedPhone(
                  supabase,
                  "", // ID not known yet
                  email,
                  String(order.order_number || order.name),
                  order,
                  token
              );
              if (resolved && !resolved.includes("x") && resolved.length >= 7) {
                  phone = resolved;
              } else {
                  // If still no phone, use a unique identifier to allow sync
                  phone = `MISSING-${shopifyId}`;
              }
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
          affectedCustomerIds.add(customer.id);

          // Step B: Upsert Order (with Authority Check)
          const lineItems = (order.line_items || []).map((item: any) => ({
            name: item.name,
            qty: item.quantity,
            price: parseFloat(item.price),
            product_id: String(item.product_id),
            title: item.title
          }));

          const orderNumber = String(order.order_number || order.name);

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
            total_discounts: parseFloat(order.total_discounts || 0),
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

      // Batch Recluster at end of page
      if (affectedCustomerIds.size > 0) {
        await Promise.all(Array.from(affectedCustomerIds).map(id => reclusterCustomer(supabase, id)));
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

      let checkoutsRes: Response = await fetch(checkoutsUrl, { headers: commonHeaders, cache: 'no-store' });

      // Handle Rate Limiting (429)
      if (checkoutsRes.status === 429) {
          send({ message: "Shopify Speed Limit Hit (Checkouts). Waiting 5s..." });
          await sleep(5000);
          checkoutsRes = await fetch(checkoutsUrl, { headers: commonHeaders, cache: 'no-store' });
      }

      const { checkouts } = await checkoutsRes.json().catch(() => ({ checkouts: [] }));

      if (!checkouts || checkouts.length === 0) break;

      send({ progress: Math.min(85, 40 + (checkoutsPage * 5)), message: `Shopify Sync: Processing checkout batch ${checkoutsPage}...` });

      for (const cart of checkouts) {
        try {
          const cartCustomer = cart.customer;
          const rawPhone = cart.phone || cartCustomer?.phone || cart.shipping_address?.phone || cart.billing_address?.phone || "";
          let phone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");

          const isMasked = !phone || phone.includes("x") || phone.includes("X") || phone.length < 7;
          let identityPhone = phone;

          if (isMasked) {
              const email = cart.email || cartCustomer?.email || null;
              const resolved = await resolveUnmaskedPhone(
                  supabase,
                  "",
                  email,
                  null, // No order ID yet
                  cart,
                  token
              );
              if (resolved && !resolved.includes("x") && resolved.length >= 7) {
                  phone = resolved;
                  identityPhone = phone;
              } else {
                  identityPhone = `GUEST-${cart.id}`;
              }
          }

          const { data: customerArr } = await supabase.from("customers").upsert({
            name: `${cartCustomer?.first_name || ""} ${cartCustomer?.last_name || ""}`.trim() || (phone ? "Shopify Customer" : "Checkout Guest"),
            phone: identityPhone,
            email: cart.email || cartCustomer?.email || null,
          }, { onConflict: "phone" }).select("id, total_orders, rto_flag");

          const customer = customerArr?.[0];
          if (!customer) continue;

          const { data: dbCartArr } = await supabase.from("abandoned_carts").upsert({
            customer_id: customer.id,
            cart_token: String(cart.token || cart.id),
            phone: phone,
            email: cart.email || null,
            total_price: parseFloat(cart.total_price || 0),
            line_items: [
              ...(cart.line_items || []),
              { __metadata: true, payload: { checkout_url: cart.abandoned_checkout_url } }
            ],
            recovery_status: "pending",
            abandoned_at: cart.updated_at || cart.created_at,
          }, { onConflict: "cart_token" }).select("id");

          const dbCart = dbCartArr?.[0];
          if (dbCart) {
            report.abandoned.synced++;
            const recoveryDate = new Date(cart.updated_at || cart.created_at);
            recoveryDate.setHours(recoveryDate.getHours() + (settings.recovery_delay_hours || 24));

            // Protection: Don't create tasks for the deep past
            const now = new Date();
            const finalDueDate = recoveryDate < now ? now : recoveryDate;

            if (phone && !phone.startsWith("GUEST-")) {
              const { data: customerDetails } = await supabase.from("customers").select("segment").eq("id", customer.id).single();
              const segment = customerDetails?.segment;

              // 🕵️ EXTRA EFFORT: Fetch stock level for the first item to prioritize recovery
              let stockLevel = null;
              const firstItem = cart.line_items?.[0];
              if (firstItem && firstItem.variant_id) {
                try {
                  const variantRes = await fetch(`https://${domain}/admin/api/2024-04/variants/${firstItem.variant_id}.json`, { headers: commonHeaders, cache: 'no-store' });
                  const { variant } = await variantRes.json();
                  stockLevel = variant?.inventory_quantity;
                } catch (e) {
                  // Ignore stock fetch errors
                }
              }

              await supabase.from("tasks").upsert({
                abandoned_cart_id: dbCart.id,
                customer_id: customer.id,
                task_type: "recovery",
                due_date: finalDueDate.toISOString().split("T")[0],
                status: "pending",
                assigned_to: await assignTaskOwner(supabase, "recovery", segment),
                priority_score: calculateTaskPriority({
                  taskType: "recovery",
                  totalPrice: parseFloat(cart.total_price),
                  totalOrders: customer.total_orders,
                  rtoFlag: customer.rto_flag,
                  stockLevel: stockLevel
                })
              }, { onConflict: "abandoned_cart_id, task_type" });
              report.tasks.created++;
            }
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

/**
 * PHASE 2: Logic to categorize customers into high-value personas
 */
async function reclusterCustomer(supabase: any, customerId: string) {
  try {
    // 1. Fetch metrics
    const { data: customer } = await supabase
      .from("customers")
      .select("total_orders, rto_count")
      .eq("id", customerId)
      .single();

    const { data: orders } = await supabase
      .from("orders")
      .select("total_price, total_discounts")
      .eq("customer_id", customerId);

    if (!customer || !orders) return;

    const totalSpend = orders.reduce((sum: number, o: any) => sum + Number(o.total_price || 0), 0);
    const totalDiscounts = orders.reduce((sum: number, o: any) => sum + Number(o.total_discounts || 0), 0);
    const avgDiscountRate = (totalSpend + totalDiscounts) > 0 ? (totalDiscounts / (totalSpend + totalDiscounts)) : 0;

    let newSegment: string = "one_time";

    if (totalSpend > 25000) {
      newSegment = "whale";
    } else if (customer.rto_count > 1) {
      newSegment = "risky_returner";
    } else if (customer.total_orders > 3) {
      newSegment = "loyalist";
    } else if (avgDiscountRate > 0.25) {
      newSegment = "bargain_hunter";
    } else if (customer.total_orders > 1) {
      newSegment = "repeat";
    }

    await supabase.from("customers").update({ segment: newSegment }).eq("id", customerId);
  } catch (e) {
    console.error(`[CLUSTERING] Failed for customer ${customerId}:`, e);
  }
}

/**
 * Scans for orders delivered 3 days ago and creates "Review Collection" tasks.
 */
export async function syncReviewTasks(supabase: any) {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const dateStr = threeDaysAgo.toISOString().split("T")[0];

  console.log(`[REVIEW-SYNC] Checking for orders delivered on ${dateStr}...`);

  // 1. Fetch orders marked as delivered around 3 days ago
  // Note: We assume there's a delivery_at timestamp or we use updated_at as a proxy if delivery_status changed to delivered
  const { data: deliveredOrders, error } = await supabase
    .from("orders")
    .select("id, customer_id, shopify_order_id, order_number, total_price, customer:customers(total_orders, rto_flag, segment)")
    .eq("delivery_status", "delivered")
    .gte("updated_at", dateStr + "T00:00:00Z")
    .lte("updated_at", dateStr + "T23:59:59Z");

  if (error) {
    console.error("[REVIEW-SYNC] Error fetching delivered orders:", error.message);
    return 0;
  }

  if (!deliveredOrders || deliveredOrders.length === 0) {
    return 0;
  }

  let createdCount = 0;
  for (const order of deliveredOrders) {
    try {
      // 2. Check if a review task already exists for this order
      const { data: existingTask } = await supabase
        .from("tasks")
        .select("id")
        .eq("order_id", order.id)
        .eq("task_type", "review")
        .maybeSingle();

      if (existingTask) continue;

      // 3. Create the review task
      const { error: taskErr } = await supabase.from("tasks").insert({
        customer_id: order.customer_id,
        order_id: order.id,
        task_type: "review",
        due_date: new Date().toISOString().split("T")[0],
        status: "pending",
        assigned_to: await assignTaskOwner(supabase, "review", (order.customer as any)?.segment),
        priority_score: calculateTaskPriority({
          taskType: "review",
          totalPrice: order.total_price,
          totalOrders: (order.customer as any)?.total_orders,
          rtoFlag: (order.customer as any)?.rto_flag
        })
      });

      if (!taskErr) createdCount++;
    } catch (e: any) {
      console.error(`[REVIEW-SYNC] Failed for order ${order.order_number}:`, e.message);
    }
  }

  return createdCount;
}
