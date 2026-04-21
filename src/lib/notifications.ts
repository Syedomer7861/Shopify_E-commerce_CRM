import { createClient } from "@supabase/supabase-js";

/**
 * Administrative Notification Utility
 * Handles routing critical system alerts to the defined admin phone.
 */
export async function notifyAdmin(message: string, type: "alert" | "info" | "error" = "info") {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Get Admin Phone from Settings
    const { data: settings } = await supabase
      .from("settings")
      .select("whatsapp_admin_phone")
      .single();

    const adminPhone = settings?.whatsapp_admin_phone;

    if (!adminPhone) {
      console.warn("Admin notification skipped: No whatsapp_admin_phone configured.");
      return;
    }

    // 2. Log Internal Alert to Audit Logs
    await supabase.from("audit_logs").insert({
      action: "admin_alert",
      entity_type: "system",
      summary: `[${type.toUpperCase()}] ${message}`,
      metadata: { adminPhone }
    });

    // 3. Send via WhatsApp (Using existing WA utility pattern)
    // Note: We'll use the server-side WhatsApp client if available
    // or trigger a webhook. For now, we log the intent.
    console.log(`[ADMIN NOTIFY] Phone: ${adminPhone} | Msg: ${message}`);
    
    // Logic to reach your WhatsApp server (wa_server.js) could go here
    // fetch(`${process.env.WA_BRIDGE_URL}/send`, { method: 'POST', body: JSON.stringify({ phone: adminPhone, message }) })

    return { ok: true };
  } catch (err) {
    console.error("Critical Notification Failure:", err);
  }
}
