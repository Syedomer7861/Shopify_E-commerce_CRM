import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { TaskType } from "@/types";
import { getSystemSettings } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority, reassignOfflineAgentTasks } from "@/lib/task-engine";
import { syncShopifyData, syncShiprocketData } from "@/lib/sync-logic";

function getSupabase() {
  return createServerClient();
}

function mapShiprocketStatus(status: string | number | null | undefined) {
  const s = String(status || "").toLowerCase();
  if (s.includes("delivered") || s === "7" || s === "10") return "delivered";
  if (s.includes("shipped") || s === "6" || s === "12" || s.includes("transit") || s.includes("undelivered")) return "in_transit";
  if (s.includes("out for delivery") || s === "13") return "out_for_delivery";
  if (s.includes("rto") || s === "9") return "rto";
  if (s.includes("canceled") || s === "8" || s.includes("cancel") || s.includes("failed")) return "failed";
  return "pending";
}

import { createSyncStream, syncHeaders } from "@/lib/sync-stream";

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const { stream, send, close } = createSyncStream();
  const streaming = req.nextUrl.searchParams.get("stream") === "true";

  const supabase = getSupabase();
  const report = {
    logs: { processed: 0, failed: 0, skipped: 0 },
    tasks: { generated: 0, checked: 0 },
    abandoned: { created: 0, recovered: 0 }
  };
  const waResults = { recovery: 0, reorder: 0, review: 0 };

  const runSync = async () => {
    try {
      const isFull = req.nextUrl.searchParams.get("full") === "true";
      
      send({ progress: 2, message: `Priority 1: Syncing Direct Store Data (Shopify) [${isFull ? 'FULL' : 'QUICK'}]...` });
      const shopifyReport = await syncShopifyData(supabase, send, isFull);
      console.log("Shopify Sync Report:", shopifyReport);

      send({ progress: 40, message: "Priority 2: Pulling Logistics Data (Shiprocket)..." });
      const shiprocketReport = await syncShiprocketData(supabase, send, isFull);
      console.log("Shiprocket Sync Report:", shiprocketReport);

      send({ progress: 70, message: "Priority 3: Processing Webhook Log Backlog..." });
      // 1. PROCESS SHIPROCKET LOGS
    const { data: logs } = await supabase
      .from("webhook_logs")
      .select("*")
      .in("source", ["shiprocket", "shiprocket_checkout"])
      .eq("status", "received")
      .order("created_at", { ascending: true })
      .limit(isFull ? 500 : 50);

    if (logs && logs.length > 0) {
      for (const log of logs) {
        const body = log.payload;
        const data = body.data || body.payload || body;
        const cartId = data.cart_id || data.checkout_id || data.cart_token;
        const orderId = data.order_id || data.channel_order_id || data.shiprocket_order_id || data.checkout_order_id;

        const rawPhone = data.phone_number || data.mobile || data.phone || data.customer_phone || data.customer_contact ||
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
          let customerSegment = null;
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

            // 1. Check for existing customer to prevent overwriting unmasked data with masked data
            const { data: existing } = await supabase.from('customers').select('id, phone, segment').eq('phone', phone).maybeSingle();
            
            if (existing) {
              customerId = existing.id;
              customerSegment = existing.segment;
              // If incoming data is masked but we already have unmasked data, skip customer upsert details
              // but we still need the customerId for the order.
            } else {
              const firstName = body.first_name || body.shipping_address?.first_name || body.billing_address?.first_name || "";
              const lastName = body.last_name || body.shipping_address?.last_name || body.billing_address?.last_name || "";
              const fullName = body.customer_name || body.shipping_address?.name || body.billing_address?.name || 
                               (firstName ? `${firstName} ${lastName}`.trim() : "Shiprocket Customer");

              const shipAddr = body.shipping_address || {};
              const billAddr = body.billing_address || {};
              const combinedAddress = [body.address, shipAddr.address1, shipAddr.address2, billAddr.address1, billAddr.address2]
                .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");

              const { data: customerData } = await supabase.from("customers").upsert({
                name: fullName,
                phone: phone,
                email: rawEmail,
                city: body.city || shipAddr.city || billAddr.city || null,
                state: body.state || shipAddr.state || billAddr.state || null,
                zip: body.pincode || shipAddr.zip || billAddr.zip || shipAddr.pincode || null,
                address: combinedAddress || null,
              }, { onConflict: "phone" }).select("id, segment");
              
              if (customerData && customerData.length > 0) {
                customerId = customerData[0].id;
                customerSegment = customerData[0].segment;
              }
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
                  assigned_to: await assignTaskOwner(supabase, "recovery", customerSegment),
                  task_type: "recovery" as any,
                  due_date: dueDate.toISOString().split("T")[0],
                  priority_score: calculateTaskPriority({
                    taskType: "recovery",
                    totalOrders: 0,
                  }),
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

             const crmStatus = mapShiprocketStatus(body.status);

             // Authority Check: Don't let older logs or Shopify data overwrite newer Shiprocket status
             const { data: existingOrder } = await supabase
               .from("orders")
               .select("id, delivery_status, source")
               .or(`shopify_order_id.eq.${orderId.toString()},order_number.eq.${orderId.toString()}`)
               .maybeSingle();

             const statusToSave = (existingOrder && existingOrder.source === "shiprocket" && existingOrder.delivery_status !== "pending" && crmStatus === "pending")
               ? existingOrder.delivery_status 
               : crmStatus;

             const upsertData: any = {
                customer_id: customerId,
                shopify_order_id: orderId.toString(),
                order_number: orderId.toString(),
                total_price: parseFloat(body.total_price || body.cart_value || 0),
                delivery_status: statusToSave,
                ordered_at: body.created_at || log.created_at,
                source: "shiprocket",
                fulfillment_status: statusToSave === "delivered" ? "fulfilled" : "unfulfilled",
                delivered_at: statusToSave === "delivered" ? (body.delivered_date || new Date().toISOString()) : null,
                line_items: enrichedItems
             };

             if (existingOrder) {
               upsertData.id = existingOrder.id;
             }

             const { error: orderErr } = await supabase.from("orders").upsert(upsertData, { onConflict: "shopify_order_id" });

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

    send({ progress: 30, message: "Validating task generation rules..." });
    // 2. TRIGGER TASK GENERATOR LOGIC
    const settings = await getSystemSettings(supabase);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: orders } = await supabase
      .from("orders")
      .select("id, customer_id, delivered_at, ordered_at, line_items, delivery_status")
      .in("delivery_status", ["delivered", "Delivered"])
      .gte("updated_at", sevenDaysAgo.toISOString());

    if (orders) {
        report.tasks.checked = orders.length;
        for (const order of orders) {
           const { count: existingCount } = await supabase.from("tasks")
              .select("id", { count: "exact", head: true })
              .eq("order_id", order.id)
              .in("task_type", ["review", "reorder", "final_followup"]);

           if (existingCount && existingCount > 0) continue;

           const { data: customer } = await supabase.from("customers").select("rto_flag, segment").eq("id", order.customer_id).single();
           if (customer?.rto_flag) continue;

           // FALLBACK LOGIC: If delivered_at is missing but status is delivered, 
           // use ordered_at or created_at as the anchor so the task isn't skipped.
           const anchorDate = order.delivered_at || order.ordered_at || new Date().toISOString();
           const deliveredDate = new Date(anchorDate);
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
             assigned_to: null,
             task_type: t.task_type as TaskType,
             due_date: addDays(deliveredDate, t.offset),
             priority_score: calculateTaskPriority({
               taskType: t.task_type as TaskType,
               totalOrders: customer?.rto_flag ? 0 : undefined,
             }),
             status: "pending",
           }));

           const assignedTo = await assignTaskOwner(supabase, "review", customer?.segment);
           newTasks.forEach((task) => {
             task.assigned_to = assignedTo;
           });

           const { error: insertErr } = await supabase.from("tasks").insert(newTasks);
           if (!insertErr) report.tasks.generated += 3;
        }
    }

    const { data: issueOrders } = await supabase
      .from("orders")
      .select("id, customer_id, total_price, delivery_status, ordered_at")
      .in("delivery_status", ["rto", "failed", "in_transit"]);

    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - 1);

    if (issueOrders) {
      for (const order of issueOrders) {
        const staleTransit = order.delivery_status === "in_transit" && new Date(order.ordered_at) <= staleCutoff;
        // --- 1. Issue Resolution Generation ---
        if (order.delivery_status === "rto" || order.delivery_status === "failed" || staleTransit) {
          const { count } = await supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("order_id", order.id)
            .eq("task_type", "issue_resolution")
            .not("status", "in", '("done","cancelled")');

          if ((count || 0) === 0) {
            const { data: customer } = await supabase
              .from("customers")
              .select("total_orders, rto_flag, segment")
              .eq("id", order.customer_id)
              .maybeSingle();

            const assignedTo = await assignTaskOwner(supabase, "issue_resolution", customer?.segment);
            await supabase.from("tasks").insert({
              order_id: order.id,
              customer_id: order.customer_id,
              assigned_to: assignedTo,
              task_type: "issue_resolution",
              due_date: new Date().toISOString().split("T")[0],
              priority_score: calculateTaskPriority({
                taskType: "issue_resolution",
                totalPrice: Number(order.total_price) || 0,
                totalOrders: customer?.total_orders || 0,
                rtoFlag: customer?.rto_flag || order.delivery_status === "rto",
              }),
              status: "pending",
            });
          }

          if (order.delivery_status !== "delivered") {
            await supabase
              .from("tasks")
              .update({ status: "cancelled" } as any)
              .eq("order_id", order.id)
              .in("task_type", ["review", "reorder", "final_followup"])
              .not("status", "in", '("done","cancelled","skipped")');
          }
        }

        // --- 2. Proactive Transit Update Generation ---
        if (order.delivery_status === "in_transit" && !staleTransit) {
          const { count } = await supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("order_id", order.id)
            .eq("task_type", "transit_update");

          if ((count || 0) === 0) {
            const { data: customer } = await supabase
              .from("customers")
              .select("total_orders, rto_flag, segment")
              .eq("id", order.customer_id)
              .maybeSingle();

            const assignedTo = await assignTaskOwner(supabase, "transit_update", customer?.segment);
            await supabase.from("tasks").insert({
              order_id: order.id,
              customer_id: order.customer_id,
              assigned_to: assignedTo,
              task_type: "transit_update" as any,
              due_date: new Date().toISOString().split("T")[0],
              priority_score: calculateTaskPriority({
                taskType: "transit_update" as any,
                totalPrice: Number(order.total_price) || 0,
                totalOrders: customer?.total_orders || 0,
                rtoFlag: customer?.rto_flag || false,
              }),
              status: "pending",
            });
          }
        }
      }
    }
    
    send({ progress: 60, message: "Running system self-healing checks..." });
     send({ progress: 80, message: "Triggering automated reminders..." });
    // 4. TRIGGER AUTO-SENDERS (Automation Fix)
    const baseUrl = req.nextUrl.origin;
    const internalHeaders: HeadersInit = process.env.CRON_SECRET
      ? { "x-cron-secret": process.env.CRON_SECRET }
      : {};
    
    // Trigger them in parallel but don't wait for them to finish before responding
    // This allows the UI to stop "Refreshing..." as soon as the database is updated
    Promise.all([
      fetch(`${baseUrl}/api/cron/recovery-reminder`, { headers: internalHeaders, cache: 'no-store' }).catch(() => null),
      fetch(`${baseUrl}/api/cron/reorder-reminder`, { headers: internalHeaders, cache: 'no-store' }).catch(() => null),
      fetch(`${baseUrl}/api/cron/review-reminder`, { headers: internalHeaders, cache: 'no-store' }).catch(() => null)
    ]);

    // 5. SYSTEM PULSE
    const syncSummary = { 
      summary: "Global CRM Refresh Triggered", 
      report: report
    };

    // Log to Sheets silently
    try {
      const { appendToSheet } = await import("@/lib/google-sheets");
      appendToSheet("Audit_Logs", {
        timestamp: new Date().toISOString(),
        action: "REFRESH",
        entity: "Admin",
        summary: `Refreshed dashboard and synced ${report.logs.processed} logs.`,
      }).catch(() => {});
    } catch {}

    // Update settings table with last sync timestamp to signal ALL users
    await supabase.from("settings").update({ updated_at: new Date().toISOString() }).eq("id", "00000000-0000-0000-0000-000000000000");

    send({ progress: 100, message: "Sync Complete!", ...report });
    close();

  } catch (err: any) {
    console.error("Super Sync Error:", err);
    send({ error: err.message });
    close();
  }
};

  if (streaming) {
    runSync();
    return new NextResponse(stream, { headers: syncHeaders });
  } else {
    await runSync();
    return NextResponse.json({ 
      success: true, 
      report: { 
        ...report, 
        whatsapp: waResults 
      } 
    });
  }
}
