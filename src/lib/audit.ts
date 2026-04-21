import { createClient as createBrowserClient } from "@/lib/supabase";
import { createClient as createServerClient } from "@supabase/supabase-js";

type AuditInput = {
  entityType: string;
  entityId?: string | null;
  action: string;
  summary: string;
  metadata?: Record<string, any>;
};

export async function logAuditEvent(input: AuditInput) {
  try {
    const supabase = createBrowserClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    await supabase.from("audit_logs").insert({
      actor_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata || {},
    });
  } catch (error) {
    console.error("audit log failed", error);
  }
}

export async function logServerAuditEvent(input: AuditInput & { actorId?: string | null; actorEmail?: string | null }) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase.from("audit_logs").insert({
      actor_id: input.actorId ?? null,
      actor_email: input.actorEmail ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata || {},
    });
  } catch (error) {
    console.error("server audit log failed", error);
  }
}
