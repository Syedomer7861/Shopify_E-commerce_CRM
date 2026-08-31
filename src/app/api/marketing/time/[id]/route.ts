import { NextRequest, NextResponse } from "next/server";
import { requireMarketing } from "@/lib/marketing-auth";
import { isWorkspaceAdmin } from "@/lib/permissions";

type Ctx = { params: { id: string } };

// DELETE /api/marketing/time/:id — remove one time entry (own, or workspace admin)
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase, user, profile } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { data: entry, error: findErr } = await supabase!
    .from("mkt_time_entries")
    .select("id, user_id")
    .eq("id", params.id)
    .single();
  if (findErr || !entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (entry.user_id !== user!.id && !isWorkspaceAdmin(profile)) {
    return NextResponse.json({ error: "You can only delete your own time entries" }, { status: 403 });
  }

  const { error } = await supabase!.from("mkt_time_entries").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
