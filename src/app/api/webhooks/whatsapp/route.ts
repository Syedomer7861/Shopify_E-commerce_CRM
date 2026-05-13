import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  try {
    const { from, body, timestamp, type, selectedButtonId } = await req.json();

    // 1. Clean the incoming phone number (remove @c.us and non-digits)
    const phone = from.split("@")[0].replace(/[^\d]/g, "");
    const cleanPhone = phone.startsWith("91") && phone.length > 10 ? phone.slice(-10) : phone;

    console.log(`📩 WhatsApp Webhook: Received ${type} from ${cleanPhone}`);

    // 2. Identify Customer
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, name")
      .eq("phone", cleanPhone)
      .maybeSingle();

    if (custErr) throw custErr;

    if (customer) {
      // Update last activity
      await supabase.from("customers").update({
        last_wa_inbound_at: new Date(timestamp * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", customer.id);

      // 3. Handle Button Clicks
      if (type === "buttons_response" && selectedButtonId) {
        console.log(`🔘 Button Clicked: ${selectedButtonId} by ${customer.name}`);
        
        // Example logic: Update related tasks or orders
        if (selectedButtonId === "confirm_delivery") {
          // Find the most recent transit_update task and mark as resolved
          await supabase.from("tasks")
            .update({ status: "completed", outcome: "Customer confirmed delivery via WhatsApp" })
            .eq("customer_id", customer.id)
            .eq("task_type", "transit_update")
            .eq("status", "pending");
        } else if (selectedButtonId === "reschedule") {
          // Create an urgent task for the agent to call for rescheduling
          await supabase.from("tasks").insert({
            customer_id: customer.id,
            task_type: "issue_resolution",
            status: "pending",
            due_date: new Date().toISOString().split("T")[0],
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
          selectedButtonId
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
