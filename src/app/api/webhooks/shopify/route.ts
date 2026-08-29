import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { WorkflowEngine } from "@/lib/workflow-engine";
import { resolveUnmaskedPhone } from "@/lib/unmask-utils";
import { normalizePhone } from "@/lib/phone-utils";
import { analyzeRTORisk } from "@/lib/risk-engine";
import crypto from "crypto";
import { safeEqual, isSecretConfigured, webhookStrict } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "webhook-shopify", 300, 60000);
  if (limited) return limited;

  const supabase = createAdminClient();

  try {
    const topic = req.headers.get("x-shopify-topic");
    const hmac = req.headers.get("x-shopify-hmac-sha256");
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);
    const settings = await getSystemSettings(supabase);

    // 1. Signature Verification
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET || settings?.shopify_webhook_secret;
    
    if (isSecretConfigured(secret)) {
      const hash = crypto
        .createHmac("sha256", secret)
        .update(rawBody, "utf8")
        .digest("base64");

      if (!safeEqual(hash, hmac)) {
        console.warn("⚠️ Shopify Webhook: rejected - invalid or missing signature.");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else if (webhookStrict()) {
      console.error("🚨 Shopify Webhook: rejected - SHOPIFY_WEBHOOK_SECRET is unset or still the placeholder.");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
    } else {
      console.warn("🚨 Shopify Webhook: SHOPIFY_WEBHOOK_SECRET is unset or still the placeholder - payload accepted UNVERIFIED. Set the real secret from the Shopify admin, then WEBHOOK_STRICT=true.");
    }

    // 2. Logging
    const { data: logEntry } = await supabase.from("webhook_logs").insert({
      source: "shopify",
      topic: topic || "unknown",
      payload: payload,
      status: "received"
    }).select("id").single();

    const logId = logEntry?.id;

    // Pulse Log: Sync the raw webhook event to Google Sheets for transparency
    import("@/lib/google-sheets").then(m => {
      m.appendToSheet("Audit_Logs", {
        timestamp: new Date().toISOString(),
        source: "shopify_webhook",
        topic: topic || "unknown",
        action: "received",
        payload_preview: JSON.stringify(payload).substring(0, 500)
      });
    });

    if (topic === "orders/create" || topic === "orders/updated" || topic === "orders/paid" || topic === "orders/fulfilled" || topic === "orders/cancelled") {
      const customerData = payload.customer;
      const rawPhone = payload.phone || customerData?.phone || payload.shipping_address?.phone || "";
      let phone = normalizePhone(rawPhone);

      // 🕵️ EXTRA EFFORT: Try to unmask/resolve phone
      const isMasked = !phone || phone.includes("x") || phone.includes("X") || phone.length < 7;
      if (isMasked) {
        const resolved = await resolveUnmaskedPhone(
          supabase,
          "", 
          payload.email || customerData?.email || null,
          String(payload.id),
          payload
        );
        if (resolved && !resolved.includes("x") && resolved.length >= 7) {
          phone = resolved;
        } else {
          phone = `MISSING-SHOP-${payload.id}`;
        }
      }

      if (phone) {
        // Upsert Customer
        const { data: customerArr } = await supabase.from("customers").upsert({
          name: `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim() || "Shopify Customer",
          phone: phone,
          email: payload.email || customerData?.email || null,
          shopify_customer_id: customerData?.id ? String(customerData.id) : null,
          city: payload.shipping_address?.city || null,
          state: payload.shipping_address?.province || null,
          zip: payload.shipping_address?.zip || null,
          address: payload.shipping_address?.address1 || null,
        }, { onConflict: "phone" }).select("id, total_orders, rto_flag, segment");

        const customer = customerArr?.[0] as any;
        if (customer) {
          // Sync Order
          const lineItems = (payload.line_items || []).map((item: any) => ({
            name: item.name,
            qty: item.quantity,
            price: parseFloat(item.price),
            product_id: String(item.product_id),
            title: item.title
          }));

          // Map fulfillment and delivery status
          // Shopify "fulfilled" only means a shipping label was created in
          // Shopify - it says nothing about a courier actually having the
          // package. This used to stamp delivery_status "in_transit" right
          // here, with no tracking_number, before Shiprocket ever confirmed
          // a real shipment - confirmed live, 12,876 orders stuck exactly
          // that way (source=shopify, in_transit, tracking_number null),
          // permanently invisible to the AWB-based sync since there's no
          // AWB to check. "in_transit" is only real once Shiprocket's own
          // webhook/sync confirms it, which sets tracking_number in the
          // same write - so this path no longer claims it.
          let deliveryStatus = "pending";
          if (topic === "orders/cancelled") {
            deliveryStatus = "failed";
          }

          // Standardized Order Matching (Identifier Resolution)
          const shopifyId = String(payload.id);
          const orderNumber = String(payload.order_number || payload.name);

          const { data: existingOrder } = await supabase
            .from("orders")
            .select("id, delivery_status, source, custom_meta")
            .or(`shopify_order_id.eq.${shopifyId},order_number.eq.${orderNumber}`)
            .maybeSingle() as { data: any; error: any };

          const currentStatus = deliveryStatus;
          const statusToSave = (existingOrder && existingOrder.source === "shiprocket" && existingOrder.delivery_status !== "pending")
            ? existingOrder.delivery_status 
            : currentStatus;

          const upsertData: any = {
            customer_id: customer.id,
            shopify_order_id: shopifyId,
            order_number: orderNumber,
            line_items: lineItems,
            total_price: parseFloat(payload.total_price || 0),
            fulfillment_status: payload.fulfillment_status || "unfulfilled",
            delivery_status: statusToSave,
            ordered_at: payload.created_at,
            source: existingOrder?.source || "shopify",
          };

          // [GOD MODE] Proactive Risk Analysis on Order Place
          const riskAnalysis = await analyzeRTORisk(supabase, customer.id, payload);
          upsertData.custom_meta = {
            ...(existingOrder?.custom_meta || {}),
            risk_analysis: riskAnalysis
          };

          if (existingOrder) {
            upsertData.id = existingOrder.id;
          }

          const { data: orderArr } = await supabase.from("orders").upsert(upsertData, { onConflict: "shopify_order_id" }).select("id");
          const order = orderArr?.[0];

          // [NEW] Proactive Task Generation (Immediate Verification)
          if (topic === "orders/create") {
            // [HARDENING] Check if order was already processed to avoid duplicate tasks
            const { data: existingTasks } = await supabase
              .from("tasks")
              .select("id")
              .eq("order_id", order?.id)
              .eq("task_type", "cod_verify");

            if (existingTasks && existingTasks.length > 0) {
              console.log(`🛡️ Webhook Hardening: cod_verify task already exists for order ${order?.id}. Skipping generation.`);
            } else {
              const isCod = (payload.financial_status === "pending") || 
                            (payload.payment_gateway_names || []).some((n: string) => n.toLowerCase().includes("cod"));
              
              if (isCod || riskAnalysis.level === "CRITICAL" || riskAnalysis.level === "HIGH") {
                 const riskBonus = riskAnalysis.level === "CRITICAL" ? 50 : 20;
                 const { error: codErr } = await supabase.from("tasks").upsert({
                   customer_id: customer.id,
                   order_id: order?.id,
                   task_type: "cod_verify",
                   due_date: new Date().toISOString().split("T")[0],
                   status: "pending",
                   priority_score: 110 + riskBonus,
                   assigned_to: await assignTaskOwner(supabase, "cod_verify", customer.segment),
                   metadata: { risk_level: riskAnalysis.level, risk_reasons: riskAnalysis.reasons } as any
                 }, { onConflict: "order_id, task_type" });
                 if (codErr) console.error(`cod_verify task upsert failed for order ${order?.id}:`, codErr.message);
              }
            }
          }

          // Auto-resolve any abandoned cart tasks
          await supabase.from("abandoned_carts").update({ recovery_status: "recovered" }).eq("phone", phone);
          const { data: cartTasks } = await supabase.from("tasks")
            .select("id")
            .eq("customer_id", customer.id)
            .eq("task_type", "recovery")
            .eq("status", "pending");
          
          if (cartTasks && cartTasks.length > 0) {
            await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).in("id", cartTasks.map(t => t.id));
          }

            // Live Sync to Google Sheets (Comprehensive Order Mirroring)
            import("@/lib/google-sheets").then(m => {
              m.appendToSheet("Orders", {
                order_number: String(payload.order_number || payload.name),
                topic: topic,
                customer: `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim(),
                phone: phone,
                total: parseFloat(payload.total_price || 0),
                items_count: payload.line_items?.length || 0,
                details: payload.line_items?.map((i: any) => `${i.title} (x${i.quantity})`).join(", ") || "",
                fulfillment: payload.fulfillment_status || "unfulfilled",
                delivery: deliveryStatus,
                city: payload.shipping_address?.city || "",
                state: payload.shipping_address?.province || "",
                timestamp: payload.created_at || new Date().toISOString()
              });
            });

            if (topic === "orders/create") {
              await WorkflowEngine.trigger("order_placed", { order_id: order?.id, customer_id: customer.id, total: payload.total_price });
            } else if (topic === "orders/paid") {
               // Handle paid events
            } else if (topic === "orders/fulfilled" && statusToSave === "in_transit") {
              // Same fix as delivery_status above: "fulfilled" in Shopify
              // isn't a real shipment confirmation on its own, so only fire
              // this when statusToSave actually reflects a Shiprocket-
              // confirmed in_transit (i.e. an existing shiprocket-sourced
              // order already at that status), not on the Shopify label
              // alone.
              await WorkflowEngine.trigger("order_in_transit", { order_id: order?.id, customer_id: customer.id });
            } else if (topic === "orders/cancelled") {
              await WorkflowEngine.trigger("order_rto", { order_id: order?.id, customer_id: customer.id });
            }
        }
      }
    }

    if (topic === "checkouts/create" || topic === "checkouts/update") {
      const customerData = payload.customer;
      const rawPhone = payload.phone || customerData?.phone || payload.shipping_address?.phone || "";
      const phone = normalizePhone(rawPhone);

      if (phone) {
        const { data: customerArr } = await supabase.from("customers").upsert({
          name: `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim() || "Checkout Guest",
          phone: phone,
          email: payload.email || customerData?.email || null,
        }, { onConflict: "phone" }).select("id, total_orders, rto_flag, segment");

        const customer = customerArr?.[0];
        if (customer) {
          const { data: cartArr } = await supabase.from("abandoned_carts").upsert({
            customer_id: customer.id,
            phone: phone,
            email: payload.email || null,
            cart_token: String(payload.token || payload.id),
            total_price: parseFloat(payload.total_price || 0),
            line_items: [
              ...(payload.line_items || []),
              { __metadata: true, payload: { checkout_url: payload.abandoned_checkout_url } }
            ],
            recovery_status: "pending",
            abandoned_at: payload.updated_at || payload.created_at,
          }, { onConflict: "cart_token" }).select("id");

          const cart = cartArr?.[0];
          if (cart) {
            const recoveryDate = new Date(payload.updated_at || payload.created_at);
            recoveryDate.setHours(recoveryDate.getHours() + (settings.recovery_delay_hours || 24));

            // Protection: Don't create tasks for the deep past
            const now = new Date();
            const finalDueDate = recoveryDate < now ? now : recoveryDate;

            await supabase.from("tasks").upsert({
              abandoned_cart_id: cart.id,
              customer_id: customer.id,
              task_type: "recovery",
              due_date: finalDueDate.toISOString().split("T")[0],
              status: "pending",
              assigned_to: await assignTaskOwner(supabase, "recovery", customer.segment),
              priority_score: calculateTaskPriority({
                taskType: "recovery",
                totalPrice: parseFloat(payload.total_price),
                totalOrders: customer.total_orders,
                rtoFlag: customer.rto_flag
              })
            }, { onConflict: "abandoned_cart_id, task_type" });

            await WorkflowEngine.trigger("cart_abandoned", { cart_id: cart.id, customer_id: customer.id, total: payload.total_price });

            // Live Sync to Google Sheets (In-Depth)
            import("@/lib/google-sheets").then(m => {
              m.appendToSheet("Abandoned_Carts", {
                cart_token: String(payload.token || payload.id),
                customer: `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim(),
                phone: phone,
                total: parseFloat(payload.total_price || 0),
                items: payload.line_items?.map((i: any) => `${i.title} (x${i.quantity})`).join(", ") || "",
                checkout_url: payload.abandoned_checkout_url || "",
                timestamp: payload.updated_at || payload.created_at
              });
            });
          }
        }
      }
    }

    // 3. Mark as Processed
    // logId is undefined when the log insert failed; skipping avoids a
    // PATCH with id=eq.undefined, which Postgres rejects with 22P02.
    if (logId) {
      await supabase.from("webhook_logs").update({ status: "processed" }).eq("id", logId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Shopify Webhook Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

