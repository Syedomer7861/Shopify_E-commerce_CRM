import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getTaskProductName } from "@/lib/utils";
import { getSystemSettings } from "@/lib/server-settings";
import { sendGmail } from "@/lib/gmail";
import { personaliseTemplate, getTemplateVariables } from "@/lib/whatsapp";

function getSupabase() {
  return createAdminClient();
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

  try {
    // 1. Get Settings
    const settings = await getSystemSettings(supabase);
    
    if (!settings) {
      console.log("⏭️ Reorder Cron Skipped: Settings not found.");
      return NextResponse.json({ skipped: true, reason: "Settings not found" });
    }

    const waEnabled = settings.whatsapp_enabled && settings.whatsapp_bridge_url && settings.wa_auto_reorder;
    const emailEnabled = settings.gmail_refresh_token && settings.email_auto_reorder;

    if (!waEnabled && !emailEnabled) {
      console.log("⏭️ Reorder Cron Skipped: Both WhatsApp and Email reorder automations disabled.");
      return NextResponse.json({ skipped: true, reason: "Automations disabled in settings" });
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
          email,
          whatsapp_reminders_enabled
        ),
        order:orders (
          id,
          order_number,
          line_items,
          shopify_order_id,
          total_price,
          tracking_number,
          fulfillment_status,
          delivery_status,
          ordered_at
        )
      `)
      .eq("task_type", "reorder")
      .eq("due_date", today)
      .eq("status", "pending");

    if (error) throw error;
    if (!tasks?.length) return NextResponse.json({ sent: 0, reason: "No reorder tasks due today" });

    let waSentCount = 0;
    let emailSentCount = 0;

    for (const task of tasks) {
      const customer = task.customer as any;
      const order = task.order as any;
      const variables = getTemplateVariables(customer, order);
      let taskActioned = false;

      // --- 1. WhatsApp Automation ---
      if (waEnabled && customer.whatsapp_reminders_enabled !== false) {
        const productName = getTaskProductName(task);
        const template = settings.whatsapp_reorder_template || `Hi {{name}}! 👋\n\nHope you're doing well. It's been a few weeks since your last order of *{{product}}*. \n\nTime for a refill? Click here to order again: cureforever.in\n\n_Replenish your wellness journey today!_ 💊`;
        const message = personaliseTemplate(template, variables);

        try {
          const res = await fetch(`${settings.whatsapp_bridge_url}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: customer.phone, message }),
          });
          const result = await res.json();
          if (res.ok && result.ok) {
            waSentCount++;
            taskActioned = true;
          }
        } catch (err) { console.error(`WA Error:`, err); }
      }

      // --- 2. Email Automation ---
      if (emailEnabled && customer.email) {
        const subjectTemplate = settings.email_reorder_subject || "Time for a refill? 🌿 {{product}}";
        const bodyTemplate = settings.email_reorder_template || "Time to replenish, {{name}}! 🌿 Your course of {{product}} should be finishing soon. 💊 Keep your wellness streak alive—order your refill here: https://cureforever.in 🙏✨";
        
        const subject = personaliseTemplate(subjectTemplate, variables);
        const body = personaliseTemplate(bodyTemplate, variables);

        try {
          await sendGmail({ to: customer.email, subject, body });
          emailSentCount++;
          taskActioned = true;
        } catch (err) { console.error(`Email Error:`, err); }
      }

      if (taskActioned) {
        await supabase.from("tasks").update({ 
          status: "done", 
          completed_at: new Date().toISOString() 
        }).eq("id", task.id);

        await supabase.from("call_logs").insert({
          task_id: task.id,
          customer_id: customer.id,
          outcome: "done",
          note: `System (Automated): Reorder reminder sent via ${waSentCount > 0 ? "WhatsApp" : ""} ${emailSentCount > 0 ? "Email" : ""}`,
          agent_name: "CureForever System"
        });
      }
    }

    return NextResponse.json({ wa_sent: waSentCount, email_sent: emailSentCount, total: tasks.length });
  } catch (err: any) {
    console.error("Reorder reminder error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
