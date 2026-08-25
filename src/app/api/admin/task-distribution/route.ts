import { NextRequest, NextResponse } from "next/server";
import { ensureAdmin, hasInternalSecret } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";

/** One-off diagnostic: real assigned_to distribution across active tasks. */
export async function GET(req: NextRequest) {
  let supabase;
  if (hasInternalSecret(req)) {
    supabase = createAdminClient();
  } else {
    const admin = await ensureAdmin();
    if (admin.errorResponse) return admin.errorResponse;
    supabase = admin.supabase;
  }

  const { data: agents } = await supabase!
    .from("profiles")
    .select("id, name, is_active, last_seen_at, status")
    .eq("role", "agent")
    .not("email", "ilike", "%demo%")
    .not("name", "ilike", "%demo%")
    .or("is_demo.is.null,is_demo.eq.false");

  const PAGE = 1000;
  const counts: Record<string, { assigned: number; overdue: number }> = {};
  let unassigned = 0;
  const today = new Date().toISOString().split("T")[0];

  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase!
      .from("tasks")
      .select("assigned_to, due_date")
      .not("status", "in", '("done","cancelled","skipped")')
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const t of data as any[]) {
      if (!t.assigned_to) { unassigned++; continue; }
      if (!counts[t.assigned_to]) counts[t.assigned_to] = { assigned: 0, overdue: 0 };
      counts[t.assigned_to].assigned++;
      if (t.due_date < today) counts[t.assigned_to].overdue++;
    }
    if (data.length < PAGE) break;
  }

  const now = Date.now();
  const distribution = (agents || []).map((a: any) => ({
    name: a.name,
    is_active: a.is_active,
    status: a.status,
    lastSeenMinsAgo: a.last_seen_at ? Math.round((now - new Date(a.last_seen_at).getTime()) / 60000) : null,
    assigned: counts[a.id]?.assigned || 0,
    overdue: counts[a.id]?.overdue || 0,
  })).sort((a: any, b: any) => b.assigned - a.assigned);

  return NextResponse.json({ unassigned, distribution });
}
