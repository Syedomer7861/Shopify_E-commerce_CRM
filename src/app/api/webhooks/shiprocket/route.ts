import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase";
import { DeliveryStatus, TaskType } from "@/types";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { WorkflowEngine } from "@/lib/workflow-engine";
import { resolveUnmaskedPhone } from "@/lib/unmask-utils";
import { normalizePhone } from "@/lib/phone-utils";
import { notifyAdmin } from "@/lib/notifications-server";
import { analyzeRTORisk } from "@/lib/risk-engine";
import { safeEqual, isSecretConfigured, webhookStrict } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createAdminClient();
}

function mapShiprocketStatus(status: string | number): DeliveryStatus {
  const s = String(status).toLowerCase();
  if (s.includes("rto") || s === "9") return "rto";
  // Checked before "delivered" - "undelivered" contains "delivered" as a
  // substring, so the plain includes("delivered") check below would
  // otherwise misread a failed delivery attempt as a successful one.
  // Confirmed live: a real courier status was exactly "Undelivered-EN-
  // ROUTE". This webhook treats it as "failed" (an NDR is actionable for
  // an agent now), unlike the AWB-polling routes (shiprocket-status.ts)
  // which treat it as "in_transit" since the courier may still retry -
  // a deliberate difference, not an inconsistency to unify away.
  if (s.includes("canceled") || s === "8" || s.includes("failed") || s.includes("undelivered") || s.includes("ndr")) return "failed";
  if (s.includes("delivered") || s === "7" || s === "10") return "delivered";
  if (s.includes("shipped") || s === "6" || s === "12" || s.includes("transit")) return "in_transit";
  if (s.includes("out for delivery") || s === "13") return "out_for_delivery";
  return "pending";
}

function getTriggerByStatus(status: string): any {
  switch (status) {
    case "delivered": return "order_delivered";
    case "rto": return "order_rto";
    case "in_transit": return "order_in_transit";
    case "out_for_delivery": return "out_for_delivery";
    case "failed": return "delivery_attempt_failed";
    default: return null;
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "webhook-shiprocket", 300, 60000);
  if (limited) return limited;

  const supabase = getSupabase();
  let body: any;
  
  try {
    console.log("🚀 SHIPROCKET WEBHOOK CALLED");
    body = await req.json();
    console.log("📦 Incoming Shiprocket Webhook:", JSON.stringify(body, null, 2));

    // 0. Initial Log
    const { data: logEntry, error: logErr } = await supabase.from("webhook_logs").insert({
      source: "shiprocket",
      topic: body.stage || body.status || "unknown",
      payload: body,
      status: "received"
    }).select("id").single();

    if (logErr) console.error("Shiprocket Webhook: could not write webhook_logs:", logErr.message);
    // Undefined when the insert failed - every later update is keyed on it.
    const logId = logEntry?.id;

    // 1. Security Check
    const token = req.headers.get("x-shiprocket-secret") || req.nextUrl.searchParams.get("token");
    const expectedToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;

    if (isSecretConfigured(expectedToken)) {
      if (!safeEqual(token, expectedToken)) {
        console.warn("⚠️ Shiprocket Webhook: rejected - invalid or missing token.");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else if (webhookStrict()) {
      console.error("🚨 Shiprocket Webhook: rejected - SHIPROCKET_WEBHOOK_TOKEN is not configured.");
      return NextResponse.json({ error: "Webhook token not configured" }, { status: 503 });
    } else {
      console.warn("🚨 Shiprocket Webhook: SHIPROCKET_WEBHOOK_TOKEN is not configured - payload accepted UNVERIFIED. Set it in the host env, then WEBHOOK_STRICT=true.");
    }

    // 2. Identify Event Type & Global IDs
    // Shiprocket sometimes wraps the body in a 'data' or 'payload' property
    const data = body.data || body.payload || body;
    
    const cartId = data.cart_id || data.checkout_id || data.cart_token || data.token;
    const rawStage = data.latest_stage || data.stage || data.checkout_stage || data.event || "";
    const stage = String(rawStage).toLowerCase();
    
    // channel_order_id is Shiprocket's field for the originating channel's
    // (Shopify's) order number - it must win over Shiprocket's own internal
    // order_id, or a store's real Shopify order and this webhook's order
    // both get created as separate rows under different ids (confirmed:
    // the Orders page showed a raw Shiprocket-id row - "6a8bf01c240c3" -
    // duplicating a real numbered order for the same customer/product).
    // The two pull-based Shiprocket syncs (sync-logic.ts, sync/shiprocket)
    // already prioritize channel_order_id this way; this handler didn't.
    let orderId = data.channel_order_id || data.order_id || data.shiprocket_order_id || data.checkout_order_id || data.order_number || data.id;

    // A "FASTTR FIX" here used to fall back to `orderId = cartId` when stage
    // was order_placed/completed but no real order identifier was present
    // (e.g. Fastrr checkout events, which carry only their own Mongo-style
    // cart_id, never a Shopify/Shiprocket order id). That created a phantom
    // order row keyed on the cart_id - shopify_order_id and order_number
    // both got set to it - which the real Shopify order webhook (arriving
    // moments later with the correct numeric id) could never match, so both
    // rows lived on forever as duplicates (confirmed: 118 such rows,
    // identical customer/product pairs, ~hourly). Leaving orderId unset
    // here is intentional: isAbandonedStage below already excludes
    // order_placed/completed by design, and the A3 order-persist block
    // below requires a truthy orderId, so this event now just upserts the
    // customer and stops - no cart-abandoned task, no fake order. The real
    // Shopify webhook creates the correct order shortly after and already
    // auto-resolves any pending cart/task for this phone on arrival.

    // --- CASE A: Checkout / Abandoned / Order Placed Events ---
    // If we have either a cartId OR an orderId, process it
    if ((cartId || orderId) && !data.status_code) {
      console.log("🛒 Processing Store Event:", { cartId, orderId, stage });
      
      // 🕵️ EXTRA ROBUST PHONE/EMAIL/NAME DETECTION
      const rawPhone = data.mobile || data.phone || data.customer_phone || data.phone_number || data.customer_contact ||
                       data.shipping_address?.phone || data.billing_address?.phone || "";
      let customerPhone = normalizePhone(rawPhone);

      const rawEmail = data.email || data.customer_email || 
                       data.shipping_address?.email || data.billing_address?.email || null;
      
      const firstName = data.first_name || data.shipping_address?.first_name || data.billing_address?.first_name || "";
      const lastName = data.last_name || data.shipping_address?.last_name || data.billing_address?.last_name || "";
      const fullName = data.customer_name || data.shipping_address?.name || data.billing_address?.name || 
                       (firstName ? `${firstName} ${lastName}`.trim() : "Shiprocket Customer");

      const productList = data.items || data.line_items || (data.item ? [data.item] : []);
      const enrichedItems = [
        ...(productList || []),
        { __metadata: true, payload: body }
      ];

      if (!customerPhone && !cartId && !orderId) {
        return NextResponse.json({ error: "Missing identity identifiers" }, { status: 400 });
      }

      // A1. Upsert Customer (Robust Identity Handling)
      let customerId: string | null = null;
      
      // IDENTITY RESOLUTION: Use Phone or Fallback to Guest ID
      const identityPhone = customerPhone || (cartId ? `GUEST-${cartId}` : null);
      
      if (identityPhone) {
        const isMasked = identityPhone.includes("x") || identityPhone.includes("X") || identityPhone.includes("_SR_");
        
        // 🕵️ AUTOMATIC UNMASKING ON ARRIVAL (Sentinel Guard)
        if (isMasked && !identityPhone.startsWith("GUEST-")) {
            const resolved = await resolveUnmaskedPhone(
                supabase,
                "", // ID not known yet
                rawEmail,
                orderId || cartId || null,
                data
            );
            if (resolved && !resolved.includes("x") && !resolved.includes("_SR_")) {
                console.log(`🔓 Sentinel Unmasked on Arrival: ${resolved}`);
                customerPhone = resolved;
            }
        }

        // resolveUnmaskedPhone() above updates customerPhone when it finds
        // a real number, but identityPhone (computed before unmasking, at
        // line ~135) was never re-derived from it - every lookup/upsert
        // below kept matching against the STALE masked value. Confirmed
        // live: dozens of genuinely distinct real orders (different order
        // numbers, different products, spread across a whole day) all
        // permanently merged onto one customer record via the phone
        // onConflict upsert, because they all shared the same masked
        // identityPhone that never got corrected to each order's real,
        // actually-distinct unmasked phone. Preferring the resolved real
        // phone here (falling back to identityPhone only when unmasking
        // never ran/found nothing, e.g. the GUEST-<cartId> case) fixes
        // that identity split going forward.
        const resolvedIdentity = customerPhone || identityPhone;

        // Fetch existing to protect name OR handle unmasking
        let existingCust: any = null;

        // Try match by phone first (standard)
        const { data: byPhone } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("phone", resolvedIdentity)
          .maybeSingle();
        existingCust = byPhone;

        const shipAddr = data.shipping_address || {};
        const billAddr = data.billing_address || {};

        const nameToSave = (fullName === "Shiprocket Customer" || !fullName) && 
                           (existingCust?.name && existingCust.name !== "Shiprocket Customer")
                           ? existingCust.name 
                           : fullName || "Checkout Guest";

        const combinedAddress = [
          data.address,
          shipAddr.address1,
          shipAddr.address2,
          billAddr.address1,
          billAddr.address2
        ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");

        const { data: customerData, error: custErr } = await supabase
          .from("customers")
          .upsert({
            name: nameToSave,
            phone: resolvedIdentity,
            email: rawEmail,
            city: data.city || shipAddr.city || billAddr.city || null,
            state: data.state || shipAddr.state || billAddr.state || null,
            zip: data.pincode || shipAddr.zip || billAddr.zip || shipAddr.pincode || null,
            address: combinedAddress || null,
          }, { onConflict: "phone" })
          .select("id");
          
        if (!custErr && customerData && customerData.length > 0) {
            customerId = customerData[0].id;
        } else if (existingCust) {
            customerId = existingCust.id;
        }
      }

      // A2. Handle as Abandoned Cart (Only if NOT order_placed and no real order ID)
      const topic = (body.topic || "").toLowerCase();
      const isAbandonedStage = stage.includes("abandoned") || 
                               stage.includes("cart_update") || 
                               stage.includes("checkout") || 
                               stage.includes("partial") ||
                               stage === "cart_created" ||
                               stage === "init" ||
                               stage === "order_screen" ||
                               stage === "phone_received" ||
                               topic.includes("cart_update");

      if (cartId && !orderId && isAbandonedStage) {
        const { data: cartDataArr, error: cartErr } = await supabase
          .from("abandoned_carts")
          .upsert({
            customer_id: customerId,
            phone: customerPhone || "unknown",
            email: rawEmail || null,
            cart_token: cartId,
            total_price: parseFloat(data.total_price || data.cart_value || data.cart_amount || body.total_price || body.cart_value || 0),
            line_items: enrichedItems,
            recovery_status: "pending",
            abandoned_at: new Date().toISOString()
          }, { onConflict: "cart_token" })
          .select("id, abandoned_at, total_price");

        if (!cartErr && cartDataArr && cartDataArr.length > 0 && customerId) {
          const cartData = cartDataArr[0];
          
          // DATA PERSISTENCE: If the incoming productList is empty, try to preserve existing items
          if (productList.length === 0) {
            const { data: existingCart } = await supabase
              .from("abandoned_carts")
              .select("line_items")
              .eq("id", cartData.id)
              .maybeSingle();
            
            if (existingCart && Array.isArray(existingCart.line_items) && existingCart.line_items.length > 0) {
              // Only update metadata, keep old items
              await supabase.from("abandoned_carts").update({
                line_items: [
                  ...existingCart.line_items.filter((i: any) => !i.__metadata),
                  { __metadata: true, payload: body }
                ]
              }).eq("id", cartData.id);
            }
          }

          const SETTINGS_ID = "00000000-0000-0000-0000-000000000000";
          const { data: settings } = await supabase.from("settings").select("recovery_delay_hours").eq("id", SETTINGS_ID).single();
          const delayHours = settings?.recovery_delay_hours || 24;
          
          const dueDateAt = new Date(Date.now() + (delayHours * 60 * 60 * 1000));
          const dueDateStr = dueDateAt.toISOString().split("T")[0];

          // DEDUPLICATION: Check if this customer already has a PENDING recovery task
          const { data: existingTask } = await supabase
            .from("tasks")
            .select("id")
            .eq("customer_id", customerId)
            .eq("task_type", "recovery")
            .eq("status", "pending")
            .maybeSingle();

          const isActionable = customerPhone && customerPhone !== "unknown" && !customerPhone.startsWith("GUEST-");

          if (isActionable) {
            if (existingTask) {
              // Update existing task instead of creating a new one
              await supabase.from("tasks").update({
                abandoned_cart_id: cartData.id,
                due_date: dueDateStr
              }).eq("id", existingTask.id);
            } else {
              // Create new task
              const { data: customerDetails } = await supabase.from("customers").select("segment").eq("id", customerId).single();
              const segment = customerDetails?.segment;

              await supabase.from("tasks").upsert({
                customer_id: customerId,
                abandoned_cart_id: cartData.id,
                assigned_to: await assignTaskOwner(supabase, "recovery", segment),
                task_type: "recovery" as any,
                due_date: dueDateStr,
                priority_score: calculateTaskPriority({ 
                  taskType: "recovery",
                  totalPrice: cartData.total_price || 0,
                  totalOrders: 0, // We could fetch this if needed
                  rtoFlag: false 
                }),
                status: "pending"
              }, { onConflict: "abandoned_cart_id, task_type" });
            }

            // Trigger Workflow: Abandoned Cart
            await WorkflowEngine.trigger("cart_abandoned", { 
              cart_id: cartData.id, 
              customer_id: customerId, 
              total: cartData.total_price 
            });
          }
      }
    }
      
      // A3. Reconciled Order Persist (Prevents duplicates between sources)
      if (orderId) {
        const orderIdentifier = orderId.toString();

        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id, source, delivery_status, custom_meta")
          .or(`shopify_order_id.eq.${orderIdentifier},order_number.eq.${orderIdentifier}`)
          .maybeSingle();

        const enrichedItems = [
          ...(productList || []),
          { __metadata: true, payload: body }
        ];

        const upsertData: any = {
          customer_id: customerId,
          shopify_order_id: orderIdentifier,
          order_number: orderIdentifier,
          total_price: parseFloat(data.total_price || data.cart_value || data.cart_amount || body.total_price || body.cart_value || 0),
          delivery_status: (existingOrder && existingOrder.delivery_status !== "pending") ? existingOrder.delivery_status : "pending",
          fulfillment_status: "unfulfilled",
          ordered_at: data.created_at || body.created_at || new Date().toISOString(),
          source: existingOrder?.source || "shopify",
          line_items: enrichedItems.length > 0 ? enrichedItems : [{ name: "Order Content", qty: 1, price: 0 }]
        };

        // --- [GOD MODE] Proactive RTO Risk Analysis ---
        const riskAnalysis = await analyzeRTORisk(supabase, customerId!, data);
        upsertData.custom_meta = {
          ...(existingOrder?.custom_meta || {}),
          risk_analysis: riskAnalysis
        };

        if (existingOrder) {
          upsertData.id = existingOrder.id;
        }

        const { data: savedOrder, error: orderErr } = await supabase.from("orders").upsert(upsertData).select("id").single();
        const internalOrderId = savedOrder?.id;

        if (orderErr) {
            console.error("❌ Failed to persist order:", orderId, orderErr);
        } else {
            console.log("✅ Order Persisted successfully:", orderId);
            if (cartId) {
                await supabase.from("abandoned_carts")
                    .update({ recovery_status: "recovered" })
                    .eq("cart_token", cartId);
            }

            // AUTO-RESOLVE RECOVERY TASKS
            const { data: pendingTasks } = await supabase
              .from("tasks")
              .select("id")
              .eq("customer_id", customerId)
              .eq("task_type", "recovery")
              .eq("status", "pending");

            if (pendingTasks && pendingTasks.length > 0) {
              const taskIds = pendingTasks.map(t => t.id);
              await supabase.from("tasks").update({ 
                status: "done", 
                completed_at: new Date().toISOString() 
              }).in("id", taskIds);
              
              await supabase.from("call_logs").insert(taskIds.map(id => ({
                task_id: id,
                customer_id: customerId,
                outcome: "done",
                note: `Automatically resolved: Order #${orderId} placed via Shiprocket.`,
                agent_name: "Shiprocket Sync"
              })));
            }

            // --- [NEW] Task Generation Sentinel ---
            // Was independently re-parsed from the raw webhook payload with
            // a narrower fallback chain (data.total_price/cart_value only)
            // than the one that actually computed upsertData.total_price
            // above (which also checks data.cart_amount, body.total_price,
            // body.cart_value). Any order whose total only appeared in one
            // of those extra fields saved correctly but read as 0 here -
            // orderTotal >= 25000 could never be true, so vip_followup was
            // never created even once despite real orders crossing it.
            // Reusing the already-computed, already-persisted value is the
            // single source of truth and can't drift out of sync again.
            const orderTotal = upsertData.total_price;
            const paymentGateway = (data.payment_gateway || body.payment_method || "").toLowerCase();
            const isCod = paymentGateway.includes("cod") || paymentGateway.includes("cash");
            
            // 1. COD & High Risk Verification (High Priority)
            if (isCod || riskAnalysis.level === "CRITICAL" || riskAnalysis.level === "HIGH") {
               const riskBonus = riskAnalysis.level === "CRITICAL" ? 50 : 20;
               const { error: codErr } = await supabase.from("tasks").upsert({
                 customer_id: customerId,
                 order_id: internalOrderId,
                 task_type: "cod_verify",
                 due_date: new Date().toISOString().split("T")[0],
                 status: "pending",
                 priority_score: 110 + riskBonus,
                 assigned_to: await assignTaskOwner(supabase, "cod_verify"),
                 metadata: { risk_level: riskAnalysis.level, risk_reasons: riskAnalysis.reasons } as any
               }, { onConflict: "order_id, task_type" });
               if (codErr) console.error(`cod_verify task upsert failed for order ${internalOrderId}:`, codErr.message);
            }

            // 2. VIP / Whale Follow-up (Urgent)
            if (orderTotal >= 25000) {
               const { error: vipErr } = await supabase.from("tasks").upsert({
                 customer_id: customerId,
                 order_id: internalOrderId,
                 task_type: "vip_followup",
                 due_date: new Date().toISOString().split("T")[0],
                 status: "pending",
                 priority_score: 130,
                 assigned_to: await assignTaskOwner(supabase, "vip_followup")
               }, { onConflict: "order_id, task_type" });
               if (vipErr) console.error(`vip_followup task upsert failed for order ${internalOrderId}:`, vipErr.message);
            }

            // 3. Welcome Call (First-time Customer)
            const { data: customerStats } = await supabase.from("customers").select("total_orders").eq("id", customerId).single();
            if ((customerStats?.total_orders || 0) <= 1) {
               const { error: welcomeErr } = await supabase.from("tasks").upsert({
                 customer_id: customerId,
                 order_id: internalOrderId,
                 task_type: "welcome_call",
                 due_date: new Date().toISOString().split("T")[0],
                 status: "pending",
                 priority_score: 90,
                 assigned_to: await assignTaskOwner(supabase, "welcome_call")
               }, { onConflict: "order_id, task_type" });
               if (welcomeErr) console.error(`welcome_call task upsert failed for customer ${customerId}:`, welcomeErr.message);
            }

            // A4. High-Value Order Sentinel (Feature 19)
            if (orderTotal >= 5000) {
                await notifyAdmin(`🚀 HIGH-VALUE ORDER! Customer ${fullName} just placed order #${orderId} for ${orderTotal} INR.`, "alert");
            }

            // A5. Refresh Health Score (Feature 17)
            await supabase.rpc('refresh_customer_health_scores');
        }

        // 4. Trigger Workflow (NEW)
        await WorkflowEngine.trigger("order_placed", { 
          order_id: (typeof internalOrderId !== 'undefined' ? internalOrderId : orderId), 
          customer_id: customerId, 
          total: data.total_price 
        });
      }

      // Update Log Success
      if (logEntry) {
          await supabase.from("webhook_logs").update({ 
              status: "processed", 
              topic: orderId ? "order_placed" : "cart_update" 
          }).eq("id", logId);
      }

      return NextResponse.json({ success: true, processed: orderId || cartId });
    }

    // --- CASE B: Tracking / Shipment Events ---
    const identifier = body.channel_order_id || body.order_id || body.shiprocket_order_id || body.awb;
    if (identifier && body.status_code) {
      const crmStatus = mapShiprocketStatus(body.status || "");
      const deliveredAt = body.delivered_date ? new Date(body.delivered_date).toISOString() : null;

      const identifierStr = identifier?.toString();

      // --- IDEMPOTENCY CHECK ---
      // Search by ANY identifier we have (shopify_order_id or order_number)
      const { data: existingOrd } = await supabase.from("orders")
        .select("id, delivery_status")
        .or(`shopify_order_id.eq.${identifierStr},order_number.eq.${identifierStr}`)
        .maybeSingle();

      if (existingOrd && existingOrd.delivery_status === crmStatus) {
         console.log(`⚡ Idempotency hit: Order ${identifierStr} is already ${crmStatus}. Skipping duplicate webhook.`);
         return NextResponse.json({ success: true, message: "Idempotency hit, status already matches" });
      }

      // Sync Customer
      const phoneCandidates = [body.customer_phone, body.mobile, body.billing_phone, body.shipping_phone].filter(Boolean);
      let phone = phoneCandidates.map(p => normalizePhone(p))[0];
      let customerId: string | null = null;
      
      if (phone) {
        const isMasked = phone.includes("x") || phone.includes("X");
        const name = body.billing_customer_name || body.shipping_customer_name || body.customer_name || body.name || "Shiprocket Customer";
        
        // 🕵️ UNMASKING: If masked, try to resolve via history/logs/carts
        if (isMasked) {
          const identifierStr = identifier?.toString();
          const resolved = await resolveUnmaskedPhone(
            supabase,
            "", // customerId not yet known
            body.customer_email || body.email || null,
            identifierStr,
            body
          );
          if (resolved && !resolved.includes("x")) {
             console.log(`🔓 Unmasked customer via Tracking Webhook: ${resolved}`);
             phone = resolved;
          }
        }

        // Find existing to protect names
        const { data: existing } = await supabase.from("customers").select("id, name, phone").eq("phone", phone).maybeSingle();
        
        if (existing) {
          customerId = existing.id;
          const updates: any = {};
          if (name !== "Shiprocket Customer" && (!existing.name || existing.name === "Shiprocket Customer" || existing.name === "Unknown Customer")) {
            updates.name = name;
          }
          if (Object.keys(updates).length > 0) {
            await supabase.from("customers").update(updates).eq("id", customerId);
          }
        } else {
          // Create new
          const { data: customer } = await supabase.from("customers").insert({
            name: name,
            phone: phone,
            email: body.customer_email || body.email || body.billing_email || null,
            address: body.customer_address || body.billing_address || body.address || null,
            city: body.customer_city || body.billing_city || body.city || null,
            state: body.customer_state || body.billing_state || body.state || null,
            zip: body.customer_pincode || body.billing_pincode || body.pincode || null,
          }).select("id").single();
          if (customer) customerId = customer.id;
        }
      }

        const { data: orders } = await supabase.from("orders")
          .select("id, line_items, shopify_order_id, order_number, customer_id")
          .or(`shopify_order_id.eq.${identifierStr},order_number.eq.${identifierStr}`)
          .limit(1);

      if (orders && orders.length > 0) {
        const orderId = orders[0].id;
        const currentCustomerId = orders[0].customer_id;
        
        const updateData: any = { delivery_status: crmStatus, tracking_number: body.awb || undefined };
        if (crmStatus === "delivered") {
          updateData.delivered_at = deliveredAt || new Date().toISOString();
        }
        await supabase.from("orders").update(updateData).eq("id", orderId);

        const trigger = getTriggerByStatus(crmStatus);
        if (trigger) {
          await WorkflowEngine.trigger(trigger, { 
            order_id: orderId, 
            customer_id: currentCustomerId || customerId 
          });
        }

        // 3. Status-Specific Processing
        if (crmStatus === "delivered") {
          // SELF-HEALING: Cancel any pending issue/transit tasks for this order
          const { data: staleTasks } = await supabase
            .from("tasks")
            .select("id, customer_id")
            .eq("order_id", orderId)
            .in("task_type", ["issue_resolution", "transit_update"])
            .not("status", "in", '("done","cancelled","skipped")');
          
          if (staleTasks && staleTasks.length > 0) {
            await supabase.from("tasks").update({ status: "cancelled" }).in("id", staleTasks.map(t => t.id));
          }
        } else {
          // SELF-HEALING: If status is NOT delivered, cancel any PREMATURE review tasks
          const { data: prematureTasks } = await supabase
            .from("tasks")
            .select("id")
            .eq("order_id", orderId)
            .in("task_type", ["review", "reorder", "final_followup"])
            .not("status", "in", '("done","cancelled","skipped")');
          
          if (prematureTasks && prematureTasks.length > 0) {
            console.log(`[Self-Heal] Cancelling ${prematureTasks.length} premature review tasks for order ${orderId} (Status: ${crmStatus})`);
            await supabase.from("tasks").update({ 
               status: "cancelled",
               metadata: { cancellation_reason: `Status changed to ${crmStatus}` } as any
            }).in("id", prematureTasks.map(t => t.id));

            // Log the self-healing action for audit
            await supabase.from("audit_logs").insert({
              entity_type: "task",
              entity_id: orderId,
              action: "self_healing_cancellation",
              summary: `Cancelled ${prematureTasks.length} premature review tasks due to status update to ${crmStatus}`,
              metadata: { order_id: orderId, status: crmStatus, tasks_cancelled: prematureTasks.length }
            });
          }
        }

        if (crmStatus === "rto") {
          // RTO Recovery is handled by WorkflowEngine.trigger("order_rto")
        } else if (crmStatus === "in_transit") {
          // Proactive Transit Inform Task
          const { count } = await supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("order_id", orderId)
            .eq("task_type", "transit_update");

          if ((count || 0) === 0) {
            const { data: customerDetails } = await supabase.from("customers").select("segment").eq("id", currentCustomerId || customerId).single();
            const segment = customerDetails?.segment;

            await supabase.from("tasks").insert({
              order_id: orderId,
              customer_id: currentCustomerId || customerId,
              assigned_to: await assignTaskOwner(supabase, "transit_update", segment),
              task_type: "transit_update",
              due_date: new Date().toISOString().split("T")[0],
              priority_score: calculateTaskPriority({
                taskType: "transit_update",
                totalPrice: Number(body.total || 0),
              }),
              status: "pending",
            });
          }
        }

        if (crmStatus === "rto" || crmStatus === "failed") {
          const { count } = await supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("order_id", orders[0].id)
            .eq("task_type", "issue_resolution")
            .not("status", "in", '("done","cancelled","skipped")');

          if ((count || 0) === 0) {
            const { data: customer } = await supabase
              .from("customers")
              .select("total_orders, rto_flag, segment")
              .eq("id", customerId)
              .maybeSingle();

            const assignedTo = await assignTaskOwner(supabase, "issue_resolution", customer?.segment);

            await supabase.from("tasks").insert({
              order_id: orders[0].id,
              customer_id: customerId,
              assigned_to: assignedTo,
              task_type: "issue_resolution",
              due_date: new Date().toISOString().split("T")[0],
              priority_score: calculateTaskPriority({
                taskType: "issue_resolution",
                rtoFlag: crmStatus === "rto" || customer?.rto_flag,
                totalOrders: customer?.total_orders || 0,
              }),
              status: "pending",
            });
          }

          await supabase
            .from("tasks")
            .update({ status: "cancelled" })
            .eq("order_id", orders[0].id)
            .in("task_type", ["review", "reorder", "final_followup"])
            .not("status", "in", '("done","cancelled","skipped")');
        }
      } else if (customerId) {
        // If the order doesn't exist yet (Direct Order), we insert it
        const updateData: any = {
            customer_id: customerId,
            shopify_order_id: identifier.toString(),
            order_number: identifier.toString(),
            delivery_status: crmStatus,
            fulfillment_status: "fulfilled", // If we have a tracking update, it's likely fulfilled
            source: "shiprocket",
            ordered_at: body.created_at || new Date().toISOString(),
            line_items: [{ name: body.order_status || "Shiprocket Order", price: parseFloat(body.total || 0), qty: 1, __metadata: true, payload: body }]
        };
        if (crmStatus === "delivered") {
          updateData.delivered_at = deliveredAt || new Date().toISOString();
        }

        const { data: newOrders } = await supabase.from("orders").insert(updateData).select("id");
        const newOrderId = newOrders?.[0]?.id;

        if (newOrderId) {
          const trigger = getTriggerByStatus(crmStatus);
          if (trigger) {
            await WorkflowEngine.trigger(trigger, { 
              order_id: newOrderId, 
              customer_id: customerId 
            });
          }

          // Proactive Tasks for Direct Orders
          if (crmStatus === "in_transit") {
            const { data: customerDetails } = await supabase.from("customers").select("segment").eq("id", customerId).single();
            await supabase.from("tasks").insert({
              order_id: newOrderId,
              customer_id: customerId,
              assigned_to: await assignTaskOwner(supabase, "transit_update", customerDetails?.segment),
              task_type: "transit_update",
              due_date: new Date().toISOString().split("T")[0],
              priority_score: calculateTaskPriority({ taskType: "transit_update", totalPrice: Number(body.total || 0) }),
              status: "pending",
            });
          } else if (crmStatus === "rto" || crmStatus === "failed") {
            const { data: customer } = await supabase.from("customers").select("total_orders, rto_flag, segment").eq("id", customerId).maybeSingle();
            await supabase.from("tasks").insert({
              order_id: newOrderId,
              customer_id: customerId,
              assigned_to: await assignTaskOwner(supabase, "issue_resolution", customer?.segment),
              task_type: "issue_resolution",
              due_date: new Date().toISOString().split("T")[0],
              priority_score: calculateTaskPriority({
                taskType: "issue_resolution",
                rtoFlag: crmStatus === "rto" || customer?.rto_flag,
                totalOrders: customer?.total_orders || 0,
              }),
              status: "pending",
            });
          }
        }
      }

      if (logEntry) {
        if (logId) await supabase.from("webhook_logs").update({ status: "processed", topic: "tracking_update" }).eq("id", logId);
      }

      // Live Sync to Google Sheets (Shipping Tracking)
      import("@/lib/google-sheets").then(m => {
        m.appendToSheet("Shipping_Logs", {
          awb: body.awb || "N/A",
          order: identifierStr,
          status: body.status || "unknown",
          crm_status: crmStatus,
          customer: body.customer_name || body.billing_customer_name || "N/A",
          phone: phone || "N/A",
          location: `${body.customer_city || ""}, ${body.customer_state || ""}`,
          timestamp: new Date().toISOString()
        });

        if (crmStatus === "rto" || crmStatus === "failed") {
          m.appendToSheet("NDR_Exceptions", {
            order: identifierStr,
            awb: body.awb || "N/A",
            customer: body.customer_name || "N/A",
            phone: phone || "N/A",
            reason: body.latest_status || body.status || "Delivery Failed",
            timestamp: new Date().toISOString()
          });
        }
      });

      return NextResponse.json({ success: true, type: "tracking", id: identifier });
    }

    // Default: Return success but log as unhandled if we reached here
    if (logEntry) {
      if (logId) await supabase.from("webhook_logs").update({ status: "processed", topic: "unhandled_format" }).eq("id", logId);
    }
    return NextResponse.json({ success: true, message: "Unhandled format logged" });

  } catch (err: any) {
    console.error("❌ Shiprocket Webhook Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
