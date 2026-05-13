import { createServerClient } from "@/lib/supabase";

/**
 * Administrative Notification Utility
 * Handles routing critical system alerts to the defined admin phone.
 */
export async function notifyAdmin(message: string, type: "alert" | "info" | "error" = "info", action: string = "admin_alert") {
  try {
    const supabase = createServerClient();

    // 1. Get Admin Phone from Settings
    const { data: settings } = await supabase
      .from("settings")
      .select("whatsapp_admin_phone")
      .single();

    const adminPhone = settings?.whatsapp_admin_phone;

    // 2. Log Internal Alert to Audit Logs
    await supabase.from("audit_logs").insert({
      action: action,
      entity_type: "system",
      summary: message.startsWith("[") ? message : `[${type.toUpperCase()}] ${message}`,
      metadata: { adminPhone }
    });

    // 3. Send via WhatsApp (Using existing WA utility pattern)
    if (adminPhone) {
        const { sendWhatsApp, cleanPhone } = await import("./whatsapp");
        const cleanedAdminPhone = cleanPhone(adminPhone);
        
        await sendWhatsApp(cleanedAdminPhone, message);
    }

    return { ok: true };
  } catch (err) {
    console.error("Critical Notification Failure:", err);
  }
}

/**
 * Client-side helper to trigger admin notifications via the API route
 */
export async function sendAdminNotification(message: string, type: "alert" | "info" | "error" = "info", action?: string) {
  try {
    await fetch("/api/admin/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, type, action })
    });
  } catch (err) {
    console.error("Failed to send admin notification:", err);
  }
}
