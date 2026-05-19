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
  return processRequest();
}

export async function POST(req: NextRequest) {
  return processRequest();
}

async function processRequest() {
  const supabase = getSupabase();

  try {
    // 1. Get Settings
    const settings = await getSystemSettings(supabase);
    
    if (!settings) {
      console.log("⏭️ Recovery Cron Skipped: Settings not found.");
      return NextResponse.json({ skipped: true, reason: "Settings not found" });
    }

    const effectiveBridgeUrl = process.env.WHATSAPP_BRIDGE_URL || settings.whatsapp_bridge_url;
    const waEnabled = settings.whatsapp_enabled && effectiveBridgeUrl && settings.wa_auto_cart_abandoned;
    const emailEnabled = settings.gmail_refresh_token && settings.email_auto_cart_abandoned;

    if (!waEnabled && !emailEnabled) {
      console.log("⏭️ Recovery Cron Skipped: Both WhatsApp and Email recovery automations disabled.");
      return NextResponse.json({ skipped: true, reason: "Automations disabled in settings" });
    }

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
          email,
          whatsapp_reminders_enabled,
          custom_meta
        ),
        abandoned_cart:abandoned_carts (
          id,
          cart_token,
          line_items,
          total_price,
          custom_meta
        )
      `)
      .eq("task_type", "recovery")
      .eq("status", "pending")
      .lte("created_at", thresholdDate);

    if (error) throw error;
    if (!tasks?.length) return NextResponse.json({ sent: 0, reason: "No recovery tasks ready yet" });

    let waSentCount = 0;
    let emailSentCount = 0;

    for (const task of tasks) {
      const customer = task.customer as any;
      const abandonedCart = task.abandoned_cart as any;
      const variables = getTemplateVariables(customer, null, abandonedCart);
      let taskActioned = false;

      // --- 1. WhatsApp Automation ---
      if (waEnabled && customer.whatsapp_reminders_enabled !== false) {
        const productName = getTaskProductName(task);
        const template = settings.whatsapp_recovery_template || `Hi {{name}}! 👋\n\nWe noticed you left *{{product}}* in your cart. We've saved it for you! \n\nClick here to complete your order and start your wellness journey: {{abandon_link}}\n\n_Use code WELCOME10 for 10% off!_ 🌿`;
        const message = personaliseTemplate(template, variables);

        try {
          const res = await fetch(`${effectiveBridgeUrl}/send`, {
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
        const subjectTemplate = settings.email_cart_abandoned_subject || "Still interested in your items? 🛒";
        const bodyTemplate = settings.email_cart_abandoned_template || "Hi {{name}} 👋, we noticed you left some items in your cart! 🛒 Don't miss out on your {{product}}. To help you complete your order, here's a special 10% discount! Use code HEALTH10 at checkout. 💊\n\nFinish here: {{abandon_link}}";
        
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
          note: `System (Recovery): Sent via ${waSentCount > 0 ? "WhatsApp" : ""} ${emailSentCount > 0 ? "Email" : ""}`,
          agent_name: "CureForever System"
        });
      }
    }

    return NextResponse.json({ wa_sent: waSentCount, email_sent: emailSentCount, total: tasks.length });
  } catch (err: any) {
    console.error("Recovery reminder error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
