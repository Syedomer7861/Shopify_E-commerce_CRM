import { NextRequest, NextResponse } from "next/server";
import { requireInternal, hasInternalSecret, getAuthenticatedSession } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Workspace-department performance: task throughput, on-time delivery, time
// logged and activity for a single marketing/creative user. The call-centre
// Performance page (calls/revenue/NDR) is meaningless for these roles, so it
// swaps to this view when the picked user's role is 'marketing'.
export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  if (!start || !end) return NextResponse.json({ error: "Missing date range" }, { status: 400 });

  // Same gate as /api/admin/analytics/agents: privileged roles see anyone,
  // an ordinary user only themselves.
  if (!hasInternalSecret(req)) {
    const { profile } = await getAuthenticatedSession();
    if (!hasPermission(profile, "view_analytics") && (!profile || profile.id !== userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  const inWindow = (iso?: string | null) => !!iso && iso >= start && iso <= end;

  try {
    const supabase = createServerClient();

    // ── Tasks assigned to this user ─────────────────────────────────────────
    const { data: tasks, error: taskErr } = await supabase
      .from("mkt_tasks")
      .select("id, status, due_date, completed_at, list_id, estimate_minutes")
      .contains("assignees", [userId]);
    if (taskErr) throw taskErr;

    const listIds = [...new Set((tasks ?? []).map((t) => t.list_id).filter(Boolean))];
    const { data: lists } = listIds.length
      ? await supabase.from("mkt_lists").select("id, name, space_id").in("id", listIds)
      : { data: [] as any[] };
    const spaceIds = [...new Set((lists ?? []).map((l: any) => l.space_id).filter(Boolean))];
    const { data: spaces } = spaceIds.length
      ? await supabase.from("mkt_spaces").select("id, name").in("id", spaceIds)
      : { data: [] as any[] };

    const listMap = new Map((lists ?? []).map((l: any) => [l.id, l]));
    const spaceMap = new Map((spaces ?? []).map((s: any) => [s.id, s.name]));

    let done = 0;
    let open = 0;
    let onTime = 0;
    let withDue = 0;
    const bySpace: Record<string, { space: string; done: number; open: number }> = {};
    const doneDaily: Record<string, number> = {};

    for (const t of tasks ?? []) {
      const spaceName =
        spaceMap.get(listMap.get(t.list_id)?.space_id) || "No Space";
      bySpace[spaceName] ??= { space: spaceName, done: 0, open: 0 };

      if (inWindow(t.completed_at)) {
        done++;
        bySpace[spaceName].done++;
        const day = t.completed_at!.slice(0, 10);
        doneDaily[day] = (doneDaily[day] || 0) + 1;
        if (t.due_date) {
          withDue++;
          if (t.completed_at!.slice(0, 10) <= t.due_date.slice(0, 10)) onTime++;
        }
      }
      if (!t.completed_at) {
        open++;
        bySpace[spaceName].open++;
      }
    }

    // ── Time logged ────────────────────────────────────────────────────────
    const { data: entries } = await supabase
      .from("mkt_time_entries")
      .select("minutes, spent_on")
      .eq("user_id", userId)
      .gte("spent_on", startDate)
      .lte("spent_on", endDate);

    const minutesLogged = (entries ?? []).reduce((a, e) => a + (e.minutes || 0), 0);
    const minutesDaily: Record<string, number> = {};
    for (const e of entries ?? []) {
      minutesDaily[e.spent_on] = (minutesDaily[e.spent_on] || 0) + (e.minutes || 0);
    }

    // ── Activity (mkt_task audit trail) ────────────────────────────────────
    const { data: acts, count: activityCount } = await supabase
      .from("audit_logs")
      .select("id, action, summary, created_at", { count: "exact" })
      .eq("entity_type", "mkt_task")
      .eq("actor_id", userId)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(30);

    // ── Daily series (hours + tasks done) ─────────────────────────────────
    const days = [...new Set([...Object.keys(minutesDaily), ...Object.keys(doneDaily)])].sort();
    const daily = days.map((d) => ({
      date: d,
      minutes: minutesDaily[d] || 0,
      tasksDone: doneDaily[d] || 0,
    }));

    return NextResponse.json({
      success: true,
      kind: "workspace",
      summary: {
        tasksDone: done,
        tasksOpen: open,
        onTimeRate: withDue ? Math.round((onTime / withDue) * 100) : null,
        hoursLogged: Math.round((minutesLogged / 60) * 10) / 10,
        activityCount: activityCount ?? 0,
      },
      bySpace: Object.values(bySpace).sort((a, b) => b.done - a.done || b.open - a.open),
      daily,
      recentActivity: acts ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Workspace performance query failed" },
      { status: 500 },
    );
  }
}
