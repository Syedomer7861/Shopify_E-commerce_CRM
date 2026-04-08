import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTaskProductName } from "@/lib/utils";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  return processRequest(req);
}

export async function POST(req: NextRequest) {
  return processRequest(req);
}

async function processRequest(req: NextRequest) {
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
      console.log("⏭️ Reorder Cron Skipped: WhatsApp disabled or Bridge URL missing.");
      return NextResponse.json({ skipped: true, reason: "WhatsApp disabled in settings" });
    }

    // 2. Find "reorder" tasks due today
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select(`
        id,
        task_type,
        due_date,
        status,
        customer:customers (
          id,
          name,
          phone,
          whatsapp_reminders_enabled
        ),
        order:orders (
          order_number,
          line_items
        )
      `)
      .eq("task_type", "reorder")
      .eq("due_date", today)
      .eq("status", "pending");

    if (error) throw error;
    if (!tasks?.length) return NextResponse.json({ sent: 0, reason: "No reorder tasks due today" });

    let sentCount = 0;
    const bridgeUrl = settings.whatsapp_bridge_url;

    for (const task of tasks) {
      const customer = task.customer as any;
      if (customer.whatsapp_reminders_enabled === false) continue;

      const productName = getTaskProductName(task);
      const template = settings.whatsapp_reorder_template || `Hi {{name}}! 👋\n\nHope you're doing well. It's been a few weeks since your last order of *{{product}}*. \n\nTime for a refill? Click here to order again: cureforever.in\n\n_Replenish your wellness journey today!_ 💊`;

      const message = template
        .replace(/{{name}}/g, customer.name || "there")
        .replace(/{{product}}/g, productName);

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

          await supabase.from("call_logs").insert({
            task_id: task.id,
            customer_id: customer.id,
            outcome: "done",
            note: `System (Automated): "${message}"`,
            agent_name: "CureForever System"
          });
        }
      } catch (err) {
        console.error(`Error sending reorder WA to ${customer.phone}:`, err);
      }
    }

    return NextResponse.json({ sent: sentCount, total: tasks.length });
  } catch (err: any) {
    console.error("Reorder reminder error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
