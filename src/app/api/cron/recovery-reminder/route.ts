import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTaskProductName } from "@/lib/utils";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  return processRequest();
}

export async function POST(req: NextRequest) {
  return processRequest();
}

async function processRequest() {
  const supabase = getSupabase();
  const today = new Date().toISOString().split("T")[0];
  const SETTINGS_ID = "00000000-0000-0000-0000-000000000000";

  try {
    // 1. Get Settings
    const { data: settings } = await supabase
      .from("settings")
      .select("*")
      .eq("id", SETTINGS_ID)
      .single();
    
    if (!settings?.whatsapp_enabled || !settings?.whatsapp_bridge_url) {
      console.log("⏭️ Recovery Cron Skipped: WhatsApp disabled or Bridge URL missing in Settings.");
      return NextResponse.json({ skipped: true, reason: "WhatsApp disabled in settings" });
    }

    // --- RECOVERY SPECIFIC: REAL-TIME (No blackout time) ---
    // We ignore the global whatsapp_send_time for recovery to hit the customer in 15 mins.

    const delayHours = settings.recovery_delay_hours || 24;
    const thresholdDate = new Date(Date.now() - (delayHours * 60 * 60 * 1000)).toISOString();

    // 2. Find "recovery" tasks that are pending and older than the threshold
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select(`
        id,
        task_type,
        due_date,
        status,
        created_at,
        customer:customers (
          id,
          name,
          phone,
          whatsapp_reminders_enabled,
          custom_meta
        ),
        abandoned_cart:abandoned_carts (
          cart_token,
          line_items
        )
      `)
      .eq("task_type", "recovery")
      .eq("status", "pending")
      .lte("created_at", thresholdDate);

    if (error) throw error;
    if (!tasks?.length) return NextResponse.json({ sent: 0, reason: "No recovery tasks ready yet" });

    let sentCount = 0;
    const bridgeUrl = settings.whatsapp_bridge_url;

    for (const task of tasks) {
      const customer = task.customer as any;
      const abandonedCart = task.abandoned_cart as any;

      // Skip if customer disabled reminders
      if (customer.whatsapp_reminders_enabled === false) continue;

      const productName = getTaskProductName(task);
      const cart = (Array.isArray(task.abandoned_cart) ? task.abandoned_cart[0] : task.abandoned_cart) as any;
      const metaItem = (cart?.line_items as any[])?.find((i: any) => i.__metadata);
      const meta = metaItem?.payload || customer.custom_meta;
      const abandonLink = meta?.ABANDONLINK || cart?.custom_meta?.ABANDONLINK || "https://cureforever.in/cart";
      // ----------------------------------------------

      const template = settings.whatsapp_recovery_template || `Hi {{name}}! 👋\n\nWe noticed you left *{{product}}* in your cart. We've saved it for you! \n\nClick here to complete your order and start your wellness journey: {{abandon_link}}\n\n_Use code WELCOME10 for 10% off!_ 🌿`;
      const message = template
        .replace(/{{name}}/g, customer.name || "there")
        .replace(/{{product}}/g, productName)
        .replace(/{{abandon_link}}/g, abandonLink);

      try {
        const res = await fetch(`${bridgeUrl}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: customer.phone, message }),
        });
        
        const result = await res.json();
        
        if (res.ok && result.ok) {
          sentCount++;
          
          await supabase.from("tasks").update({ 
            status: "done", 
            completed_at: new Date().toISOString() 
          }).eq("id", task.id);

          // Log the automated Recovery message
          await supabase.from("call_logs").insert({
            task_id: task.id,
            customer_id: customer.id,
            outcome: "done",
            note: `System (Recovery): "${message}"`,
            agent_name: "CureForever System"
          });
        }
      } catch (err) {
        console.error(`Error sending Recovery WhatsApp to ${customer.phone}:`, err);
      }
    }

    return NextResponse.json({ sent: sentCount, total: tasks.length });
  } catch (err: any) {
    console.error("Recovery reminder error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
