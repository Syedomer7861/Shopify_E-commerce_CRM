import { getSystemSettings, getShopifyAccessToken, getShiprocketToken } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { resolveUnmaskedPhone } from "./unmask-utils";
import { normalizePhone } from "./phone-utils";

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * customers.phone and abandoned_carts.phone are VARCHAR(20). The synthetic
 * placeholder used when a real number cannot be resolved was
 * `MISSING-${shopifyId}` = 8 + 13 chars = 21, which Postgres rejected with
 * 22001 "value too long for type character varying(20)" and silently dropped
 * the order. Keep every synthetic value inside the column width.
 */
export function placeholderPhone(externalId: string | number) {
  return `NO-${externalId}`.slice(0, 20);
}

/**
 * Serverless functions are killed at a hard wall (60s on Vercel Hobby, 300s on
 * Pro) and a killed function returns a 504 with no report, so the caller
 * cannot tell what was written. A budget lets the sync stop one record short
 * of the wall and return what it did, and the next run picks up from there.
 *
 * Every sync writes with upsert, so re-processing a record already handled is
 * a no-op rather than a duplicate.
 */
export type SyncBudget = {
  /** Stop starting new records once this many ms have elapsed. */
  budgetMs?: number;
};

export function makeDeadline(opts?: SyncBudget) {
  const started = Date.now();
  const budget = opts?.budgetMs ?? Infinity;
  return {
    expired: () => Date.now() - started >= budget,
    elapsed: () => Date.now() - started,
  };
}

export function mapShiprocketStatus(status: string | number) {
  const s = String(status).toLowerCase();
  if (s.includes("rto") || s === "9") return "rto";
  if (s.includes("delivered") || s === "7" || s === "10") return "delivered";
  if (s.includes("shipped") || s === "6" || s === "12" || s.includes("transit")) return "in_transit";
  if (s.includes("out for delivery") || s === "13") return "out_for_delivery";
  if (s.includes("canceled") || s === "8" || s.includes("cancel")) return "failed";
  if (s.includes("new") || s === "1" || s.includes("pickup") || s === "2" || s === "3" || s === "4" || s === "5") return "pending";
  return "pending";
}

export function parseShiprocketDate(dateStr: string | null | undefined): string {
  if (!dateStr) return new Date().toISOString();
  if (dateStr.includes("-")) {
    const parts = dateStr.split(" ")[0].split("-");
    if (parts[0].length === 4) {
      return new Date(dateStr).toISOString();
    } else if (parts[2]?.length === 4) {
      const [d, m, y] = parts;
      const time = dateStr.split(" ")[1] || "00:00:00";
      return new Date(`${y}-${m}-${d}T${time}`).toISOString();
    }
  }
  return new Date(dateStr).toISOString();
}

// Shiprocket sometimes sends a lone "," or "." as a name field - truthy, so
// .filter(Boolean) alone let it through and joined into garbage like
// ",subash .". Drop fragments that are only punctuation/whitespace first.
const isNameJunk = (s: any) => !s || !String(s).replace(/[\s,.\-_]/g, "");
export function extractShiprocketName(sr: any): string {
  const billing = [sr.billing_customer_name, sr.billing_last_name].filter(s => !isNameJunk(s)).join(" ").trim();
  const shipping = [sr.shipping_customer_name, sr.shipping_last_name].filter(s => !isNameJunk(s)).join(" ").trim();
  const customer = [sr.customer_first_name, sr.customer_last_name].filter(s => !isNameJunk(s)).join(" ").trim();
  const generic = sr.customer_name?.trim();
  return billing || shipping || customer || generic || "Shiprocket Customer";
}

export function extractShiprocketLineItems(sr: any): any[] {
  const items = sr.order_items || sr.products || sr.line_items || [];
  if (!Array.isArray(items) || items.length === 0) {
    return [{ name: "Order Item", qty: 1, price: parseFloat(sr.total || sr.sub_total || 0) }];
  }
  return items.map((item: any) => ({
    name: item.name || item.product_name || item.title || "Product",
    qty: parseInt(item.units || item.quantity || item.qty || 1),
    price: parseFloat(item.selling_price || item.price || 0),
    sku: item.sku || null,
    product_id: item.product_id || null,
  }));
}

export async function syncShopifyData(
  supabase: any,
  send: (data: any) => void,
  full: boolean = false,
  opts?: SyncBudget
) {
  const deadline = makeDeadline(opts);
  const report = {
    orders: { synced: 0, skipped: 0 },
    abandoned: { synced: 0, skipped: 0 },
    customers: { updated: 0 },
    tasks: { created: 0 },
    /** True when the budget ran out before the source was exhausted. */
    truncated: false,
    errors: [] as string[]
  };

  try {
    send({ progress: 10, message: `Shopify ${full ? "FULL " : ""}Sync: Connecting...` });
    const settings = await getSystemSettings(supabase);
    if (!settings?.shopify_store_domain) {
      const hasID = settings?.id ? `(ID: ${settings.id})` : "(No settings object found)";
      throw new Error(`Shopify domain not configured in settings ${hasID}. Check RLS or Service Role Key.`);
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
        // Checked before each order, not mid-order: stopping part-way through
        // one order could leave a customer written without its order.
        if (deadline.expired()) {
          report.truncated = true;
          send({ message: `Budget reached after ${report.orders.synced} orders; the next run continues from here.` });
          break;
        }
        try {
          const customerData = order.customer;
          const rawPhone = order.phone || customerData?.phone || order.shipping_address?.phone || order.billing_address?.phone || "";
          let phone = normalizePhone(rawPhone);

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
                  phone = placeholderPhone(shopifyId);
              }
          }

          // Step A: Upsert Customer
          const customerRow = {
            name: `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim() || "Shopify Customer",
            phone: phone,
            email: order.email || customerData?.email || null,
            shopify_customer_id: customerData?.id ? String(customerData.id) : null,
            address: order.shipping_address?.address1 || null,
            city: order.shipping_address?.city || null,
            state: order.shipping_address?.province || null,
            zip: order.shipping_address?.zip || null,
          };

          let { data: customerArr, error: customerErr } = await supabase
            .from("customers").upsert(customerRow, { onConflict: "phone" })
            .select("id, total_orders, rto_flag");

          // One Shopify customer can appear under two phone numbers (an
          // unmasked number one run, a placeholder the next). The conflict
          // target is phone, so Postgres tries to INSERT and trips
          // customers_shopify_customer_id_key. Phone is the identity we key
          // on, so retry without the Shopify id rather than losing the order.
          if (customerErr?.code === "23505" && customerRow.shopify_customer_id) {
            ({ data: customerArr, error: customerErr } = await supabase
              .from("customers")
              .upsert({ ...customerRow, shopify_customer_id: null }, { onConflict: "phone" })
              .select("id, total_orders, rto_flag"));
          }

          if (customerErr) {
            report.errors.push(`Customer for order ${order.id}: ${customerErr.message}`);
            continue;
          }

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

          // Shopify's fulfillment_status only means a shipping label was
          // created in Shopify - it's not a real shipment confirmation, and
          // this loop runs every 15 minutes (the "frequent" cron tier).
          // Stamping "in_transit" straight off it here was the live source
          // of the ghost-in_transit bug (also fixed in webhooks/shopify -
          // commit 7bc4bff) - confirmed still running: it was silently
          // re-overwriting orders the AWB-based reconciliation had just
          // correctly marked delivered, every 15 minutes, while that
          // reconciliation was in progress. New orders start "pending"
          // until Shiprocket's own webhook/sync confirms a real shipment.
          // Any status beyond "pending" is Shiprocket- or
          // cancellation-confirmed and this loop has no business
          // overwriting it, regardless of which source first wrote it.
          const currentStatus = "pending";
          const statusToSave = (existingOrder && existingOrder.delivery_status && existingOrder.delivery_status !== "pending")
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
            // Update by primary key. The old code put existingOrder.id into an
            // upsert whose conflict target was shopify_order_id: when the row
            // had been matched on order_number instead, Postgres found no
            // conflict on shopify_order_id, tried to INSERT, and hit
            // orders_pkey with the id we had just supplied (23505 / HTTP 409).
            await supabase.from("orders").update(upsertData).eq("id", existingOrder.id);
          } else {
            await supabase.from("orders").upsert(upsertData, {
              onConflict: "shopify_order_id",
              ignoreDuplicates: false
            });
          }
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

      if (report.truncated) break;
    }

    // Checkouts are lower value than orders, so a tight budget spends what is
    // left on orders and picks these up next run.
    if (deadline.expired()) {
      report.truncated = true;
      send({ progress: 90, message: "Budget reached; skipping checkouts this run." });
      return report;
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
        if (deadline.expired()) {
          report.truncated = true;
          send({ message: "Budget reached during checkouts; the next run continues from here." });
          break;
        }
        try {
          // 1. STALENESS GUARD: Skip checkouts older than 7 days
          const abandonedAt = cart.updated_at || cart.created_at;
          const ageInDays = (new Date().getTime() - new Date(abandonedAt).getTime()) / (1000 * 60 * 60 * 24);
          
          if (ageInDays > 7) {
            continue; // Ignore old carts to prevent dashboard clutter
          }

          const cartCustomer = cart.customer;
          const rawPhone = cart.phone || cartCustomer?.phone || cart.shipping_address?.phone || cart.billing_address?.phone || "";
          let phone = normalizePhone(rawPhone);

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

            // Use the strict recovery date. If it's in the past, let it naturally fall into the "Overdue" bucket.
            const finalDueDate = recoveryDate;

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

              // 2. STATUS LOCK: Don't re-open tasks that are already done or cancelled
              const { data: existingTask } = await supabase
                .from("tasks")
                .select("status")
                .eq("abandoned_cart_id", dbCart.id)
                .eq("task_type", "recovery")
                .maybeSingle();

              if (existingTask && (existingTask.status === "done" || existingTask.status === "cancelled")) {
                continue; // Maintain the finished/cancelled state
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

      if (report.truncated) break;
    }

    return report;
  } catch (e: any) {
    report.errors.push(`Global Sync Shopify: ${e.message}`);
    return report;
  }
}

/**
 * PULL DATA FROM SHIPROCKET API
 */
export async function syncShiprocketData(supabase: any, send: (data: any) => void, full: boolean = false, opts?: SyncBudget) {
  // Had no budget at all, unlike syncShopifyData - each order does a
  // resolveUnmaskedPhone lookup plus 2-3 DB round trips, and full sync
  // pages up to 20 x 50 orders. Confirmed by production logs: the
  // dedicated /api/cron/shiprocket-sync endpoint (nothing else chained)
  // was timing out on its own, and this function is the same shape.
  const deadline = makeDeadline(opts);
  const report = {
    orders: { synced: 0, failed: 0 },
    customers: { created: 0, updated: 0 },
    truncated: false,
    errors: [] as string[]
  };

  try {
    send({ progress: 45, message: "Shiprocket Sync: Connecting..." });
    const token = await getShiprocketToken(supabase);
    
    let currentPage = 1;
    let hasMore = true;
    const MAX_PAGES = full ? 20 : 2; // Pull more if full sync

    while (hasMore && currentPage <= MAX_PAGES) {
      if (deadline.expired()) {
        report.truncated = true;
        send({ message: `Budget reached after ${report.orders.synced} orders; the next run continues from here.` });
        break;
      }

      send({ progress: 45 + (currentPage * 2), message: `Shiprocket Sync: Fetching page ${currentPage}...` });

      const res = await fetch(`${SHIPROCKET_BASE_URL}/orders?per_page=50&page=${currentPage}&sort=created_at&sort_dir=desc`, {
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
      });

      if (!res.ok) throw new Error(`Shiprocket API error: ${res.status}`);
      const orderData = await res.json();
      const srOrders = orderData.data || [];

      if (srOrders.length === 0) break;

      for (const sr of srOrders) {
        if (deadline.expired()) {
          report.truncated = true;
          break;
        }
        try {
          const orderId = String(sr.channel_order_id || sr.id);
          const email = sr.billing_email || sr.shipping_email || sr.customer_email || null;
          
          // Try to resolve unmasked phone
          const phone = await resolveUnmaskedPhone(supabase, "", email, orderId, sr, token);
          if (!phone) continue;

          const name = extractShiprocketName(sr);
          const crmStatus = mapShiprocketStatus(sr.status || "");

          // 1. Upsert Customer
          const { data: custArr } = await supabase.from("customers").upsert({
            name: name,
            phone: phone,
            email: email,
            address: sr.shipping_address || null,
            city: sr.shipping_city || null,
            state: sr.shipping_state || null,
            zip: sr.shipping_pincode || null,
          }, { onConflict: "phone" }).select("id, segment");

          const customer = custArr?.[0];
          if (!customer) continue;

          // 2. Upsert Order
          // orderId falls back to sr.id (Shiprocket's own internal order
          // id) when sr.channel_order_id is missing - common for orders
          // routed through third-party checkouts (e.g. Fastrr) that don't
          // always get linked back to Shopify. That fallback id has no
          // relationship to the real order's shopify_order_id, so
          // upserting on onConflict: "shopify_order_id" alone found no
          // conflict against the already-synced Shopify-sourced row and
          // inserted a second row instead - confirmed live: 2,592 orders
          // duplicated this way (2,592 order_numbers with both a
          // "shopify" and a "shiprocket" row), including several created
          // today, well after this file's other sync function (just
          // above) was already fixed for the identical class of bug.
          // Mirroring that same reconciliation-by-order_number pattern here.
          const orderNumber = String(sr.order_no || orderId);
          const { data: existingSrOrder } = await supabase
            .from("orders")
            .select("id, source")
            .or(`shopify_order_id.eq.${orderId},order_number.eq.${orderNumber}`)
            .maybeSingle();

          const orderPayload: any = {
            shopify_order_id: orderId,
            order_number: orderNumber,
            customer_id: customer.id,
            total_price: parseFloat(sr.total || 0),
            ordered_at: parseShiprocketDate(sr.created_at),
            source: existingSrOrder?.source || "shiprocket",
            delivery_status: crmStatus,
            fulfillment_status: ["delivered", "in_transit", "out_for_delivery"].includes(crmStatus) ? "fulfilled" : "unfulfilled",
            tracking_number: sr.shipments?.[0]?.awb || sr.awb_code || null,
            courier_name: sr.shipments?.[0]?.courier || sr.courier_name || null,
            line_items: extractShiprocketLineItems(sr),
          };

          const { error: orderErr } = existingSrOrder
            ? await supabase.from("orders").update(orderPayload).eq("id", existingSrOrder.id)
            : await supabase.from("orders").upsert(orderPayload, { onConflict: "shopify_order_id" });

          if (orderErr) {
            report.orders.failed++;
          } else {
            report.orders.synced++;
            // Recluster customer to ensure segment is up to date
            await reclusterCustomer(supabase, customer.id);
          }
        } catch (e: any) {
          report.errors.push(`SR Order ${sr.id}: ${e.message}`);
        }
      }

      currentPage++;
      if (full) await sleep(500); // Backoff
    }

    return report;
  } catch (e: any) {
    report.errors.push(`Global Sync Shiprocket: ${e.message}`);
    return report;
  }
}

/**
 * PHASE 2: Logic to categorize customers into high-value personas
 */
export async function reclusterCustomer(supabase: any, customerId: string) {
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
