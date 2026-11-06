import "server-only";
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
      org_id: settings?.org_id,
      action: action,
      entity_type: "system",
      summary: message.startsWith("[") ? message : `[${type.toUpperCase()}] ${message}`,
      metadata: { adminPhone }
    });

    // 3. Send via WhatsApp (Using existing WA utility pattern)
    if (adminPhone) {
        const { sendWhatsApp, cleanPhone } = await import("./whatsapp");
        const cleanedAdminPhone = cleanPhone(adminPhone);

        await sendWhatsApp(cleanedAdminPhone, message, undefined, settings?.org_id);
    }

    return { ok: true };
  } catch (err) {
    console.error("Critical Notification Failure:", err);
  }
}

/**
 * Server-side: insert a per-user in-app notification (see notifications
 * table, migrations/20260827_notifications_table.sql). Uses the admin
 * client - the table has no insert policy for authenticated users, only
 * select/update-own, so this only works from server code.
 */
export async function notifyUser(userId: string, title: string, body?: string, link?: string, type: "info" | "success" | "warning" | "alert" = "info") {
  try {
    const { createAdminClient } = await import("./supabase");
    const supabase = createAdminClient();
    // Service-role insert has no session to resolve org_id's DEFAULT from
    // (it'd silently fall back to the seed org regardless of which
    // tenant this user actually belongs to) - resolve it explicitly from
    // the target user's own profile instead.
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", userId).maybeSingle();
    await supabase.from("notifications").insert({ org_id: profile?.org_id, user_id: userId, title, body: body || null, link: link || null, type });
  } catch (err) {
    console.error("Failed to create user notification:", err);
  }
  // Best-effort real push (works even with the tab/app closed) - never
  // let a push failure affect the in-app notification above, which is
  // the reliable baseline this whole notification system depends on.
  await sendPushToUser(userId, title, body, link).catch(err => console.error("Push delivery failed:", err));
}

/**
 * Sends a real OS-level push to every device a user has subscribed from
 * (see push_subscriptions table, migrations/20260827c_push_subscriptions.sql).
 * No-ops quietly if VAPID keys aren't configured for this environment -
 * the in-app bell in notifyUser() above always works regardless.
 */
async function sendPushToUser(userId: string, title: string, body?: string, link?: string) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;

  const { createAdminClient } = await import("./supabase");
  const supabase = createAdminClient();
  const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@cureforever.in", publicKey, privateKey);

  const payload = JSON.stringify({ title, body, link });

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    } catch (err: any) {
      // 404/410 = the browser/OS has permanently invalidated this
      // subscription (uninstalled, permission revoked, etc) - stop
      // trying it on every future notification instead of erroring
      // forever on a dead endpoint.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("web-push send failed:", err?.message || err);
      }
    }
  }));
}
