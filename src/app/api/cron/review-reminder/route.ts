import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getTaskProductName } from "@/lib/utils";
import { getSystemSettings } from "@/lib/server-settings";
import { requireInternal } from "@/lib/auth-utils";

function getSupabase() {
  return createAdminClient();
}

export async function GET(req: NextRequest) {
  return processRequest(req);
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  return processRequest(req);
}

async function processRequest(req: NextRequest) {
  const supabase = getSupabase();

  try {
    const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
    let sentCount = 0;
    let totalTasks = 0;

    for (const org of orgs ?? []) {
      const result = await processOrg(supabase, org.id);
      sentCount += result.sent;
      totalTasks += result.total;
    }

    return NextResponse.json({ sent: sentCount, total: totalTasks });
  } catch (err: any) {
    console.error("Review reminder error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function processOrg(supabase: any, orgId: string) {
  const today = new Date().toISOString().split("T")[0];

  // 1. Get Settings
  const settings = await getSystemSettings(supabase, orgId);

  const effectiveBridgeUrl = process.env.WHATSAPP_BRIDGE_URL || settings?.whatsapp_bridge_url;
  if (!settings?.whatsapp_enabled || !effectiveBridgeUrl || !settings?.wa_auto_order_delivered) {
    return { sent: 0, total: 0 };
  }

  // 2. Find "review" tasks due today
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
    .eq("task_type", "review")
    .eq("due_date", today)
    .eq("status", "pending")
    .eq("org_id", orgId);

  if (error) throw error;
  if (!tasks?.length) return { sent: 0, total: 0 };

  let sentCount = 0;
  const bridgeUrl = effectiveBridgeUrl;

  {
    for (const task of tasks) {
      const customer = task.customer as any;
      if (customer.whatsapp_reminders_enabled === false) continue;

      const productName = getTaskProductName(task);
      const template = settings.whatsapp_review_template || `Hi {{name}}! 👋\n\nHow is your experience with *{{product}}* so far? We'd love to hear your thoughts! \n\nClick here to leave a review: [REVIEW_LINK]\n\n_Your feedback helps us grow!_ 🌿`;

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
            org_id: orgId,
            task_id: task.id,
            customer_id: customer.id,
            outcome: "done",
            note: `System (Automated): "${message}"`,
            agent_name: "CureForever System"
          });
        }
      } catch (err) {
        console.error(`Error sending review WA to ${customer.phone}:`, err);
      }
    }
  }

  return { sent: sentCount, total: tasks.length };
}
