import { createServerClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";

/**
 * Administrative Notification Utility
 * Handles routing critical system alerts to the defined admin phone.
 */
export async function notifyAdmin(message: string, type: "alert" | "info" | "error" = "info", action: string = "admin_alert") {
  try {
    const supabase = createServerClient();

    // 1. Get Admin Phone from Settings
    // settings RLS is admin-only now (it holds API secrets); this runs for
    // every agent's task completion/note-save/etc via /api/admin/notify,
    // not just admin actions, so it needs the service-role fallback rather
    // than a raw .select() under the caller's own (often non-admin) session.
    const settings = await getSystemSettings(supabase);
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
