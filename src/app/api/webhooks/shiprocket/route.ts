import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DeliveryStatus, TaskType } from "@/types";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function mapShiprocketStatus(status: string | number): DeliveryStatus {
  const s = String(status).toLowerCase();
  if (s.includes("delivered") || s === "7" || s === "10") return "delivered";
  if (s.includes("shipped") || s === "6" || s === "12" || s.includes("transit")) return "in_transit";
  if (s.includes("out for delivery") || s === "13") return "out_for_delivery";
  if (s.includes("rto") || s === "9") return "rto";
  if (s.includes("canceled") || s === "8") return "failed";
  return "pending";
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  let body: any;
  
  try {
    body = await req.json();
    console.log("📦 Incoming Shiprocket Webhook:", JSON.stringify(body, null, 2));

    // 0. Initial Log
    const { data: logEntry, error: logErr } = await supabase.from("webhook_logs").insert({
      source: "shiprocket",
      topic: body.stage || body.status || "unknown",
      payload: body,
      status: "received"
    }).select("id").single();

    // 1. Security Check
    const token = req.headers.get("x-shiprocket-secret") || req.nextUrl.searchParams.get("token");
    const expectedToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;
    if (expectedToken && token !== expectedToken) {
      console.warn("⚠️ Webhook Unauthorized - Token mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Identify Event Type & Global IDs
    // Shiprocket sometimes wraps the body in a 'data' or 'payload' property
    const data = body.data || body.payload || body;
    
    const cartId = data.cart_id || data.checkout_id || data.cart_token;
    const stage = data.latest_stage?.toLowerCase() || data.stage?.toLowerCase() || (cartId ? "checkout" : "unknown");
    
    let orderId = data.order_id || data.channel_order_id || data.shiprocket_order_id || data.checkout_order_id || data.order_number || data.id;
    
    // FASTTR FIX: If stage is order_placed, treat as order even if orderId is missing
    if (!orderId && stage === "order_placed") {
      orderId = cartId;
    }

    // --- CASE A: Checkout / Abandoned / Order Placed Events ---
    // If we have either a cartId OR an orderId, process it
    if ((cartId || orderId) && !data.status_code) {
      console.log("🛒 Processing Store Event:", { cartId, orderId, stage });
      
      // 🕵️ EXTRA ROBUST PHONE/EMAIL/NAME DETECTION
      const rawPhone = data.mobile || data.phone || data.customer_phone || data.phone_number ||
                       data.shipping_address?.phone || data.billing_address?.phone || "";
      const customerPhone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");
      
      const rawEmail = data.email || data.customer_email || 
                       data.shipping_address?.email || data.billing_address?.email || null;
      
      const firstName = data.first_name || data.shipping_address?.first_name || data.billing_address?.first_name || "";
      const lastName = data.last_name || data.shipping_address?.last_name || data.billing_address?.last_name || "";
      const fullName = data.customer_name || data.shipping_address?.name || data.billing_address?.name || 
                       (firstName ? `${firstName} ${lastName}`.trim() : "Shiprocket Customer");

      const productList = data.items || data.line_items || (data.item ? [data.item] : []);

      if (!customerPhone && !cartId && !orderId) {
        return NextResponse.json({ error: "Missing identity identifiers" }, { status: 400 });
      }

      // A1. Upsert Customer
      let customerId: string | null = null;
      if (customerPhone) {
        // Fetch existing to protect name
        const { data: existingCust } = await supabase
          .from("customers")
          .select("name")
          .eq("phone", customerPhone)
          .maybeSingle();

      const shipAddr = data.shipping_address || {};
      const billAddr = data.billing_address || {};

      const nameToSave = (fullName === "Shiprocket Customer" || !fullName) && 
                         (existingCust?.name && existingCust.name !== "Shiprocket Customer")
                         ? existingCust.name 
                         : fullName;

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
          phone: customerPhone,
          email: rawEmail,
          city: data.city || shipAddr.city || billAddr.city || null,
          state: data.state || shipAddr.state || billAddr.state || null,
          zip: data.pincode || shipAddr.zip || billAddr.zip || shipAddr.pincode || null,
          address: combinedAddress || null,
        }, { onConflict: "phone" })
        .select("id");
        
        if (!custErr && customerData && customerData.length > 0) {
            customerId = customerData[0].id;
        } else {
            // ABSOLUTE MATCH FALLBACK: Sometimes upsert select fails to return the ID for existing records
            const { data: existing } = await supabase.from('customers').select('id').eq('phone', customerPhone).maybeSingle();
            if (existing) customerId = existing.id;
        }
      }

      // A2. Handle as Abandoned Cart (Only if NOT order_placed and no real order ID)
      if (cartId && !orderId && stage !== "order_placed") {
        const enrichedItems = [
          ...(productList || []),
          { __metadata: true, payload: body }
        ];

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
          .select("id, abandoned_at");

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

          if (existingTask) {
            // Update existing task instead of creating a new one
            await supabase.from("tasks").update({
              abandoned_cart_id: cartData.id,
              due_date: dueDateStr
            }).eq("id", existingTask.id);
          } else {
            // Create new task
            await supabase.from("tasks").upsert({
              customer_id: customerId,
              abandoned_cart_id: cartData.id,
              task_type: "recovery" as TaskType,
              due_date: dueDateStr,
              status: "pending"
            }, { onConflict: "abandoned_cart_id, task_type" });
          }
        }
      }

      // A3. Handle as Confirmed Order
      if (orderId && customerId) {
        console.log(`📦 Attempting to save order: ${orderId} for customer: ${customerId}`);
        const enrichedItems = [
          ...(productList || []),
          { __metadata: true, payload: body }
        ];

        const { error: orderErr } = await supabase.from("orders").upsert({
          customer_id: customerId,
          shopify_order_id: orderId.toString(),
          order_number: orderId.toString(),
          total_price: parseFloat(data.total_price || data.cart_value || data.cart_amount || body.total_price || body.cart_value || 0),
          delivery_status: "pending",
          fulfillment_status: "unfulfilled",
          ordered_at: data.created_at || body.created_at || new Date().toISOString(),
          source: "shiprocket",
          line_items: enrichedItems.length > 0 ? enrichedItems : [{ name: "Order Content", qty: 1, price: 0 }]
        }, { onConflict: "shopify_order_id" });

        if (orderErr) {
            console.error("❌ Failed to persist order:", orderId, orderErr);
        } else {
            console.log("✅ Order Persisted successfully:", orderId);
            // If we have a cartId, mark it as recovered
            if (cartId) {
                await supabase.from("abandoned_carts")
                    .update({ recovery_status: "recovered" })
                    .eq("cart_token", cartId);
            }

            // AUTO-RESOLVE RECOVERY TASKS: If this customer had a pending recovery task, mark it as DONE
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
              
              // Log the outcome to Call History
              await supabase.from("call_logs").insert(taskIds.map(id => ({
                task_id: id,
                customer_id: customerId,
                outcome: "done",
                note: `Automatically resolved: Order #${orderId} placed via Shiprocket.`,
                agent_name: "Shiprocket Sync"
              })));
              
              console.log(`✅ Auto-resolved ${pendingTasks.length} recovery tasks for customer.`);
            }
        }
      }

      // Update Log Success
      if (logEntry) {
          await supabase.from("webhook_logs").update({ 
              status: "processed", 
              topic: orderId ? "order_placed" : "cart_update" 
          }).eq("id", logEntry.id);
      }

      return NextResponse.json({ success: true, processed: orderId || cartId });
    }

    // --- CASE B: Tracking / Shipment Events ---
    const identifier = body.channel_order_id || body.order_id || body.shiprocket_order_id || body.awb;
    if (identifier && body.status_code) {
      const crmStatus = mapShiprocketStatus(body.status || "");
      const deliveredAt = body.delivered_date ? new Date(body.delivered_date).toISOString() : null;

      // Sync Customer
      const phone = (body.customer_phone || body.mobile || "").toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");
      let customerId: string | null = null;
      if (phone) {
        const { data: customer } = await supabase.from("customers").upsert({
          name: body.customer_name || body.name || "Shiprocket Customer",
          phone: phone,
          email: body.customer_email || body.email || null,
          address: body.customer_address || body.address || null,
          city: body.customer_city || body.city || null,
          state: body.customer_state || body.state || null,
          zip: body.customer_pincode || body.pincode || null,
        }, { onConflict: "phone" }).select("id").single();
        if (customer) customerId = customer.id;
      }

      // Update Order
      const { data: orders } = await supabase.from("orders")
          .select("id, line_items")
          .or(`shopify_order_id.eq.${identifier},order_number.eq.${identifier}`)
          .limit(1);

      if (orders && orders.length > 0) {
        const updateData: any = { delivery_status: crmStatus, tracking_number: body.awb || undefined };
        if (crmStatus === "delivered") {
          updateData.delivered_at = deliveredAt || new Date().toISOString();
        }
        await supabase.from("orders").update(updateData).eq("id", orders[0].id);
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
        await supabase.from("orders").insert(updateData);
      }

      if (logEntry) {
          await supabase.from("webhook_logs").update({ status: "processed", topic: "tracking_update" }).eq("id", logEntry.id);
      }

      return NextResponse.json({ success: true, type: "tracking", id: identifier });
    }

    // Default: Return success but log as unhandled if we reached here
    if (logEntry) {
      await supabase.from("webhook_logs").update({ status: "processed", topic: "unhandled_format" }).eq("id", logEntry.id);
    }
    return NextResponse.json({ success: true, message: "Unhandled format logged" });


  } catch (err: any) {
    console.error("❌ Shiprocket Webhook Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
