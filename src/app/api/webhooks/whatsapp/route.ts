import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase";
import { hasInternalSecret } from "@/lib/auth-utils";
import { normalizePhone } from "@/lib/phone-utils";

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "webhook-whatsapp", 300, 60000);
  if (limited) return limited;

  // Only the WhatsApp bridge daemon (wa_server.js) may post inbound messages.
  if (!hasInternalSecret(req)) {
    console.warn("⚠️ WhatsApp Webhook: rejected - missing or invalid bridge secret.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const { from, body, timestamp, type, selectedButtonId } = await req.json();

    // 1. Clean the incoming phone number (remove @c.us and non-digits)
    const cleanPhone = normalizePhone(from.split("@")[0]);

    console.log(`📩 WhatsApp Webhook: Received ${type} from ${cleanPhone}`);

    // 2. Identify Customer
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, name")
      .eq("phone", cleanPhone)
      .maybeSingle();

    if (custErr) throw custErr;

    if (customer) {
      // 🕵️ SENTIMENT & URGENCY DETECTION
      const messageBody = (body || "").toLowerCase();
      const urgentKeywords = ["fraud", "fake", "scam", "wrong", "cancel", "refund", "cheated", "police", "consumer court", "urgent", "emergency", "missing"];
      const isUrgent = urgentKeywords.some(kw => messageBody.includes(kw));
      
      // Update last activity & potentially flag as high risk if they use negative keywords
      await supabase.from("customers").update({
        last_wa_inbound_at: new Date(timestamp * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", customer.id);

      if (isUrgent) {
          console.log(`🚨 URGENCY DETECTED: Customer ${customer.name} sent urgent message.`);
          // Elevate ANY pending tasks for this customer
          await supabase.from("tasks")
            .update({ 
                is_urgent: true, 
                sentiment: 'negative',
                priority_score: 150 // Jump to the absolute top
            })
            .eq("customer_id", customer.id)
            .not("status", "in", '("done","cancelled","skipped")');
      }

      // 3. Handle Button Clicks
      if (type === "buttons_response" && selectedButtonId) {
        console.log(`🔘 Button Clicked: ${selectedButtonId} by ${customer.name}`);
        
        // Example logic: Update related tasks or orders
        if (selectedButtonId === "confirm_delivery") {
          // Find the most recent transit_update task and mark as resolved.
          // "completed" isn't a valid tasks.status (constraint only allows
          // pending/due/in_progress/done/skipped/cancelled) and tasks has no
          // "outcome" column - this update has always failed silently.
          const { data: resolvedTasks } = await supabase.from("tasks")
            .update({ status: "done" })
            .eq("customer_id", customer.id)
            .eq("task_type", "transit_update")
            .eq("status", "pending")
            .select("id");

          for (const t of resolvedTasks || []) {
            await supabase.from("call_logs").insert({
              task_id: t.id,
              customer_id: customer.id,
              outcome: "done",
              note: "Customer confirmed delivery via WhatsApp button",
              agent_name: "WhatsApp Bot",
              called_at: new Date().toISOString(),
            });
          }
        } else if (selectedButtonId === "reschedule") {
          // Create an urgent task for the agent to call for rescheduling
          await supabase.from("tasks").insert({
            customer_id: customer.id,
            task_type: "issue_resolution",
            status: "pending",
            is_urgent: true,
            due_date: new Date().toISOString().split("T")[0],
            priority_score: 140,
            metadata: { reason: "Customer requested reschedule via WhatsApp" }
          });
        }
      }

      // Log the activity
      await supabase.from("webhook_logs").insert({
        source: "whatsapp",
        topic: "message",
        payload: { 
          from: cleanPhone, 
          body: body.substring(0, 100),
          type,
          selectedButtonId,
          is_urgent: isUrgent
        },
        status: "processed"
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("❌ WhatsApp Webhook Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
