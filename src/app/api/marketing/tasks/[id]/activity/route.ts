import { NextRequest, NextResponse } from "next/server";
import { requireMarketing } from "@/lib/marketing-auth";

// GET /api/marketing/tasks/:id/activity — the per-task audit trail.
// PATCH/DELETE on mkt_tasks already write to audit_logs with
// entity_type='mkt_task'.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase!
    .from("audit_logs")
    .select("id, action, summary, actor_email, actor_id, metadata, created_at")
    .eq("entity_type", "mkt_task")
    .eq("entity_id", params.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach the actor's name (audit_logs only stores id + email).
  const ids = [...new Set((data ?? []).map((r: any) => r.actor_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: people } = await supabase!.from("profiles").select("id, name").in("id", ids);
    for (const p of people ?? []) names.set(p.id, p.name);
  }
  return NextResponse.json(
    (data ?? []).map((r: any) => ({ ...r, actor_name: r.actor_id ? names.get(r.actor_id) ?? null : null }))
  );
}
