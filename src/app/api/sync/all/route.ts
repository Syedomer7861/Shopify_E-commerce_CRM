import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TaskType } from "@/types";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const report = {
    logs: { processed: 0, failed: 0, skipped: 0 },
    tasks: { generated: 0, checked: 0 },
    abandoned: { created: 0, recovered: 0 }
  };

  try {
    // 1. PROCESS SHIPROCKET LOGS
    const { data: logs } = await supabase
      .from("webhook_logs")
      .select("*")
      .eq("source", "shiprocket")
      .eq("status", "received")
      .order("created_at", { ascending: true });

    if (logs && logs.length > 0) {
      for (const log of logs) {
        const body = log.payload;
        const cartId = body.cart_id || body.checkout_id;
        const orderId = body.order_id || body.channel_order_id;

        const data = body.data || body.payload || body;
        const rawPhone = data.phone_number || data.mobile || data.phone || data.customer_phone || 
                         data.shipping_address?.phone || data.billing_address?.phone || "";
        const phone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");
        
        if (!phone && !cartId) {
          await supabase.from("webhook_logs").update({ status: "skipped" }).eq("id", log.id);
          report.logs.skipped++;
          continue;
        }

        try {
          // A1. Customer Upsert
          let customerId = null;
          if (phone) {
            const rawEmail = body.email || body.customer_email || body.shipping_address?.email || body.billing_address?.email || null;
            
            const firstName = body.first_name || body.shipping_address?.first_name || body.billing_address?.first_name || "";
            const lastName = body.last_name || body.shipping_address?.last_name || body.billing_address?.last_name || "";
            const fullName = body.customer_name || body.shipping_address?.name || body.billing_address?.name || 
                             (firstName ? `${firstName} ${lastName}`.trim() : "Shiprocket Customer");

            const shipAddr = body.shipping_address || {};
            const billAddr = body.billing_address || {};

            const combinedAddress = [
                body.address,
                shipAddr.address1,
                shipAddr.address2,
                billAddr.address1,
                billAddr.address2
            ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");

            const { data: customerData } = await supabase.from("customers").upsert({
              name: fullName,
              phone: phone,
              email: rawEmail,
              city: body.city || shipAddr.city || billAddr.city || null,
              state: body.state || shipAddr.state || billAddr.state || null,
              zip: body.pincode || shipAddr.zip || billAddr.zip || shipAddr.pincode || null,
              address: combinedAddress || null,
            }, { onConflict: "phone" }).select("id");
            
            if (customerData && customerData.length > 0) customerId = customerData[0].id;
            else {
               const { data: existing } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
               if (existing) customerId = existing.id;
            }
          }

          const productList = body.items || body.line_items || (body.item ? [body.item] : []);

          // A2. Abandoned Cart
          if (cartId && !orderId && !body.status_code) {
             const enrichedItems = [
                ...(productList || []),
                { __metadata: true, payload: body }
             ];

             const { data: cartDataArr } = await supabase.from("abandoned_carts").upsert({
                customer_id: customerId,
                phone: phone || "unknown",
                email: body.email || null,
                cart_token: cartId,
                total_price: parseFloat(body.cart_value || body.total_price || 0),
                line_items: enrichedItems,
                recovery_status: "pending",
                abandoned_at: log.created_at
             }, { onConflict: "cart_token" }).select("id, abandoned_at");

             if (cartDataArr && cartDataArr.length > 0 && customerId) {
                const cartData = cartDataArr[0];
                const { data: settings } = await supabase.from("settings").select("recovery_delay_hours").single();
                const delayHours = settings?.recovery_delay_hours || 24;
                const dueDate = new Date(new Date(cartData.abandoned_at).getTime() + delayHours * 60 * 60 * 1000);

                await supabase.from("tasks").upsert({
                  customer_id: customerId,
                  abandoned_cart_id: cartData.id,
                  task_type: "recovery" as any,
                  due_date: dueDate.toISOString().split("T")[0],
                  status: "pending"
                }, { onConflict: "abandoned_cart_id, task_type" });
                report.abandoned.created++;
             }
          }

          // A3. Order
          if (orderId && customerId) {
             const enrichedItems = [
                ...(productList || []),
                { __metadata: true, payload: body }
             ];

             const { error: orderErr } = await supabase.from("orders").upsert({
                customer_id: customerId,
                shopify_order_id: orderId.toString(),
                order_number: orderId.toString(),
                total_price: parseFloat(body.total_price || body.cart_value || 0),
                delivery_status: body.status || "pending",
                ordered_at: body.created_at || log.created_at,
                source: body.source || "shiprocket",
                line_items: enrichedItems
             }, { onConflict: "shopify_order_id" });

             if (!orderErr) {
                if (cartId) {
                    await supabase.from("abandoned_carts").update({ recovery_status: "recovered" }).eq("cart_token", cartId);
                    report.abandoned.recovered++;
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
                  } as any).in("id", taskIds);
                  
                  // Log the outcome to Call History
                  await supabase.from("call_logs").insert(taskIds.map(id => ({
                    task_id: id,
                    customer_id: customerId,
                    outcome: "done",
                    note: `Automatically resolved: Order #${orderId} synced from logs.`,
                    agent_name: "System Sync"
                  })));
                }
             }
          }

          await supabase.from("webhook_logs").update({ 
            status: "processed", 
            topic: orderId ? "order_placed" : (body.status_code ? "tracking_update" : "cart_update") 
          }).eq("id", log.id);
          report.logs.processed++;

        } catch (e) {
          console.error(`Failed log processing ${log.id}:`, e);
          report.logs.failed++;
        }
      }
    }

    // 2. TRIGGER TASK GENERATOR LOGIC
    const { data: settings } = await supabase.from("settings").select("*").limit(1).maybeSingle();
    const { data: orders } = await supabase
      .from("orders")
      .select("id, customer_id, delivered_at, line_items, delivery_status")
      .in("delivery_status", ["delivered", "Delivered"])
      .not("delivered_at", "is", null);

    if (orders) {
        report.tasks.checked = orders.length;
        for (const order of orders) {
           const { count: existingCount } = await supabase.from("tasks")
              .select("id", { count: "exact", head: true })
              .eq("order_id", order.id)
              .in("task_type", ["review", "reorder", "final_followup"]);

           if (existingCount && existingCount > 0) continue;

           const { data: customer } = await supabase.from("customers").select("rto_flag").eq("id", order.customer_id).single();
           if (customer?.rto_flag) continue;

           const deliveredDate = new Date(order.delivered_at);
           if (isNaN(deliveredDate.getTime()) || deliveredDate.getFullYear() < 2020) continue;

           const addDays = (d: Date, n: number) => {
             const r = new Date(d);
             r.setDate(r.getDate() + n);
             return r.toISOString().split("T")[0];
           };

           const taskTemplates = [
             { task_type: "review",         offset: settings?.review_offset_days ?? 5 },
             { task_type: "reorder",        offset: settings?.reorder_offset_days ?? 20 },
             { task_type: "final_followup", offset: settings?.final_offset_days ?? 30 },
           ];

           const newTasks = taskTemplates.map(t => ({
             order_id: order.id,
             customer_id: order.customer_id,
             task_type: t.task_type as TaskType,
             due_date: addDays(deliveredDate, t.offset),
             status: "pending",
           }));

           const { error: insertErr } = await supabase.from("tasks").insert(newTasks);
           if (!insertErr) report.tasks.generated += 3;
        }
    }
    
    // 3. SELF-HEAL: CLOSE TASKS FOR RECOVERED CARTS / ORDERS
    // This catches tasks that weren't closed during their respective log processing
    const { data: pendingRecovery } = await supabase
      .from("tasks")
      .select("id, customer_id, abandoned_cart_id")
      .eq("task_type", "recovery")
      .eq("status", "pending");

    if (pendingRecovery && pendingRecovery.length > 0) {
      for (const t of pendingRecovery) {
        // Check if customer has an order after the task was created
        const { data: order } = await supabase
          .from("orders")
          .select("order_number")
          .eq("customer_id", t.customer_id)
          .limit(1)
          .maybeSingle();

        if (order) {
           await supabase.from("tasks").update({ 
              status: "done", 
              completed_at: new Date().toISOString() 
           } as any).eq("id", t.id);
           
           await supabase.from("call_logs").insert({
             task_id: t.id,
             customer_id: t.customer_id,
             outcome: "done",
             note: `Healed: Task resolved because order #${order.order_number} was found.`,
             agent_name: "Repair Sync"
           });
        }
      }
    }
    
    // 4. TRIGGER AUTO-SENDERS (Automation Fix)
    const baseUrl = req.nextUrl.origin;
    const waResults = { recovery: 0, reorder: 0, review: 0 };
    
    try {
      // Trigger them in parallel
      const [recRes, reoRes, revRes] = await Promise.all([
        fetch(`${baseUrl}/api/cron/recovery-reminder`).then(r => r.json()).catch(() => ({ sent: 0 })),
        fetch(`${baseUrl}/api/cron/reorder-reminder`).then(r => r.json()).catch(() => ({ sent: 0 })),
        fetch(`${baseUrl}/api/cron/review-reminder`).then(r => r.json()).catch(() => ({ sent: 0 }))
      ]);
      
      waResults.recovery = recRes.sent || 0;
      waResults.reorder = reoRes.sent || 0;
      waResults.review = revRes.sent || 0;
    } catch (waErr) {
      console.error("Auto-sender trigger failed:", waErr);
    }

    return NextResponse.json({ 
      success: true, 
      report: { 
        ...report, 
        whatsapp: waResults 
      } 
    });

  } catch (err: any) {
    console.error("Super Sync Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
