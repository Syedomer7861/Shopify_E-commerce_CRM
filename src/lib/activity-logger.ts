/**
 * Utility to log agent activity via the server-side API.
 * This ensures that activity is both saved to the database 
 * and synced LIVE to Google Sheets.
 */
export async function logActivity(data: {
  agent_id?: string;
  activity_type: string;
  description?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const res = await fetch("/api/activity-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (error) {
    console.error("Failed to log activity:", error);
    return { success: false, error };
  }
}
