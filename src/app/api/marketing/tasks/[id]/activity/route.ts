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
    .select("id, action, summary, actor_email, metadata, created_at")
    .eq("entity_type", "mkt_task")
    .eq("entity_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
