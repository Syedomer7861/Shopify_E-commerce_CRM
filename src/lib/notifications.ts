// Client-safe notification helpers only. The server-side senders
// (notifyAdmin/notifyUser, and the web-push delivery inside notifyUser)
// live in notifications-server.ts, which pulls in server-only packages
// (web-push -> https-proxy-agent -> Node's `net`) that break the client
// build if bundled - this file is imported by client components
// (dashboard, ManagerTaskReview, login) so it must stay free of any
// server-only import, direct or transitive.

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

/**
 * Client-side helper to trigger a per-user notification via the API route.
 */
export async function sendUserNotification(userId: string, title: string, body?: string, link?: string, type: "info" | "success" | "warning" | "alert" = "info") {
  try {
    await fetch("/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title, body, link, type })
    });
  } catch (err) {
    console.error("Failed to send user notification:", err);
  }
}
