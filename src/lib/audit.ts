import { createClient, createServerClient } from "@/lib/supabase";

type AuditInput = {
  entityType: string;
  entityId?: string | null;
  action: string;
  summary: string;
  metadata?: Record<string, any>;
};

export async function logAuditEvent(input: AuditInput) {
  try {
    // Determine which client to use:
    // On the client, we MUST use the anon client (createClient).
    // On the server (API/Actions), we use the service role client (createServerClient).
    const isServer = typeof window === 'undefined';
    const supabase = isServer ? createServerClient() : createClient();
    
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    const { error } = await supabase.from("audit_logs").insert({
      actor_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata || {},
    });

    if (error) throw error;

    // --- NEW: Live Sync to Google Sheets ---
    // We use fetch even on the server to avoid bundling Node.js libs into the client
    const syncPayload = {
      agent_id: user?.id,
      activity_type: input.action,
      description: input.summary,
      metadata: input.metadata
    };

    const baseUrl = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000');
    
    fetch(`${baseUrl}/api/activity-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncPayload)
    }).catch(e => console.error("Audit sync failed:", e));
  } catch (error) {
    console.error("audit log failed", error);
  }
}

/**
 * Shorthand for logging user actions from the client
 */
export async function logUserAction(action: string, summary: string, metadata?: Record<string, any>) {
  return logAuditEvent({
    entityType: "user_action",
    action,
    summary,
    metadata
  });
}

export async function logServerAuditEvent(input: AuditInput & { actorId?: string | null; actorEmail?: string | null }) {
  try {
    if (typeof window !== 'undefined') {
      throw new Error("logServerAuditEvent can only be called from the server");
    }
    const supabase = createServerClient();

    const { error } = await supabase.from("audit_logs").insert({
      actor_id: input.actorId ?? null,
      actor_email: input.actorEmail ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata || {},
    });

    if (error) throw error;

    // Use fetch to sync to Google Sheets via the API route
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
    fetch(`${baseUrl}/api/activity-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: input.actorId,
        activity_type: input.action,
        description: input.summary,
        metadata: input.metadata
      })
    }).catch(e => console.error("Server Audit sync failed:", e));
  } catch (error) {
    console.error("server audit log failed", error);
  }
}
