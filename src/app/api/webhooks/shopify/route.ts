import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSystemSettings } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { WorkflowEngine } from "@/lib/workflow-engine";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const topic = req.headers.get("x-shopify-topic");
    const hmac = req.headers.get("x-shopify-hmac-sha256");
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);
    const settings = await getSystemSettings(supabase);

    // 1. Signature Verification
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET || settings?.shopify_webhook_secret;
    if (secret && hmac) {
      const hash = crypto
        .createHmac("sha256", secret)
        .update(rawBody, "utf8")
        .digest("base64");
      
      if (hash !== hmac) {
        console.warn("⚠️ Shopify Webhook: Invalid Signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // 2. Logging
    await supabase.from("webhook_logs").insert({
      source: "shopify",
      topic: topic || "unknown",
      payload: payload,
      status: "received"
    });

    if (topic === "orders/create" || topic === "orders/updated" || topic === "orders/paid" || topic === "orders/fulfilled" || topic === "orders/cancelled") {
      const customerData = payload.customer;
      const rawPhone = payload.phone || customerData?.phone || payload.shipping_address?.phone || "";
      const phone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");

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
        }, { onConflict: "phone" }).select("id, total_orders, rto_flag");

        const customer = customerArr?.[0];
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
          let deliveryStatus = "pending";
          if (topic === "orders/fulfilled" || payload.fulfillment_status === "fulfilled") {
            deliveryStatus = "in_transit";
          } else if (topic === "orders/cancelled") {
            deliveryStatus = "failed";
          }

          const { data: orderArr } = await supabase.from("orders").upsert({
            customer_id: customer.id,
            shopify_order_id: String(payload.id),
            order_number: String(payload.order_number || payload.name),
            line_items: lineItems,
            total_price: parseFloat(payload.total_price || 0),
            fulfillment_status: payload.fulfillment_status || "unfulfilled",
            delivery_status: deliveryStatus,
            ordered_at: payload.created_at,
            source: "shopify",
          }, { onConflict: "shopify_order_id" }).select("id");

          const order = orderArr?.[0];

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

          // Trigger WorkflowEngine
          if (topic === "orders/create") {
            await WorkflowEngine.trigger("order_placed", { order_id: order?.id, customer_id: customer.id, total: payload.total_price });
          } else if (topic === "orders/paid") {
             // Handle paid events
          } else if (topic === "orders/fulfilled") {
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
      const phone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");

      if (phone) {
        const { data: customerArr } = await supabase.from("customers").upsert({
          name: `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim() || "Checkout Guest",
          phone: phone,
          email: payload.email || customerData?.email || null,
        }, { onConflict: "phone" }).select("id, total_orders, rto_flag");

        const customer = customerArr?.[0];
        if (customer) {
          const { data: cartArr } = await supabase.from("abandoned_carts").upsert({
            customer_id: customer.id,
            phone: phone,
            email: payload.email || null,
            cart_token: String(payload.token || payload.id),
            total_price: parseFloat(payload.total_price || 0),
            line_items: payload.line_items || [],
            recovery_status: "pending",
            abandoned_at: payload.updated_at || payload.created_at,
          }, { onConflict: "cart_token" }).select("id");

          const cart = cartArr?.[0];
          if (cart) {
            const recoveryDate = new Date(payload.updated_at || payload.created_at);
            recoveryDate.setHours(recoveryDate.getHours() + (settings.recovery_delay_hours || 24));

            await supabase.from("tasks").upsert({
              abandoned_cart_id: cart.id,
              customer_id: customer.id,
              task_type: "recovery",
              due_date: recoveryDate.toISOString().split("T")[0],
              status: "pending",
              assigned_to: await assignTaskOwner(supabase),
              priority_score: calculateTaskPriority({
                taskType: "recovery",
                totalPrice: parseFloat(payload.total_price),
                totalOrders: customer.total_orders,
                rtoFlag: customer.rto_flag
              })
            }, { onConflict: "abandoned_cart_id, task_type" });

            await WorkflowEngine.trigger("cart_abandoned", { cart_id: cart.id, customer_id: customer.id, total: payload.total_price });
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Shopify Webhook Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

