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
      .select("id, status, priority, due_date, completed_at, created_at, list_id, estimate_minutes")
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

    // Aggregate task done/on-time counts over an arbitrary [ws, we] window so
    // the same logic serves the current range and the previous one (deltas).
    const taskAgg = (ws: string, we: string) => {
      let d = 0;
      let ot = 0;
      let wd = 0;
      for (const t of tasks ?? []) {
        if (!t.completed_at || t.completed_at < ws || t.completed_at > we) continue;
        d++;
        if (t.due_date) {
          wd++;
          if (t.completed_at.slice(0, 10) <= t.due_date.slice(0, 10)) ot++;
        }
      }
      return { done: d, onTimeRate: wd ? Math.round((ot / wd) * 100) : null };
    };

    const cur = taskAgg(start, end);
    const done = cur.done;
    let open = 0;
    const todayKey = new Date().toISOString().slice(0, 10);
    let overdueNow = 0;
    const bySpace: Record<string, { space: string; done: number; open: number }> = {};
    const doneDaily: Record<string, number> = {};
    const priorityMix: Record<string, number> = { urgent: 0, high: 0, normal: 0, low: 0 };

    for (const t of tasks ?? []) {
      const spaceName =
        spaceMap.get(listMap.get(t.list_id)?.space_id) || "No Space";
      bySpace[spaceName] ??= { space: spaceName, done: 0, open: 0 };

      if (inWindow(t.completed_at)) {
        bySpace[spaceName].done++;
        doneDaily[t.completed_at!.slice(0, 10)] = (doneDaily[t.completed_at!.slice(0, 10)] || 0) + 1;
        const p = (t.priority || "normal") as keyof typeof priorityMix;
        if (p in priorityMix) priorityMix[p]++;
      }
      if (!t.completed_at) {
        open++;
        bySpace[spaceName].open++;
        if (t.due_date && t.due_date.slice(0, 10) < todayKey) overdueNow++;
      }
    }

    // Previous equal-length window for delta arrows.
    const span = Date.parse(end) - Date.parse(start);
    const prevOk = Number.isFinite(span) && span > 0;
    const prevStart = prevOk ? new Date(Date.parse(start) - span).toISOString() : start;
    const prevEnd = start;
    const prev = prevOk ? taskAgg(prevStart, prevEnd) : { done: null as number | null, onTimeRate: null as number | null };

    // ── Time logged (current + previous window) ───────────────────────────
    const prevStartDate = prevStart.slice(0, 10);
    const prevEndDate = prevEnd.slice(0, 10);
    const [{ data: entries }, { data: prevEntries }] = await Promise.all([
      supabase.from("mkt_time_entries").select("minutes, spent_on, task_id")
        .eq("user_id", userId).gte("spent_on", startDate).lte("spent_on", endDate),
      prevOk
        ? supabase.from("mkt_time_entries").select("minutes")
            .eq("user_id", userId).gte("spent_on", prevStartDate).lt("spent_on", prevEndDate)
        : Promise.resolve({ data: null as any }),
    ]);

    const minutesLogged = (entries ?? []).reduce((a, e) => a + (e.minutes || 0), 0);
    const prevMinutes = (prevEntries ?? []).reduce((a: number, e: any) => a + (e.minutes || 0), 0);
    const minutesDaily: Record<string, number> = {};
    for (const e of entries ?? []) {
      minutesDaily[e.spent_on] = (minutesDaily[e.spent_on] || 0) + (e.minutes || 0);
    }

    // ── Activity (mkt_task audit trail), current + previous window ─────────
    const [
      { data: acts, count: activityCount },
      { count: prevActivityCount },
    ] = await Promise.all([
      supabase.from("audit_logs")
        .select("id, action, summary, created_at", { count: "exact" })
        .eq("entity_type", "mkt_task").eq("actor_id", userId)
        .gte("created_at", start).lte("created_at", end)
        .order("created_at", { ascending: false }).limit(30),
      prevOk
        ? supabase.from("audit_logs")
            .select("id", { count: "exact", head: true })
            .eq("entity_type", "mkt_task").eq("actor_id", userId)
            .gte("created_at", prevStart).lt("created_at", prevEnd)
        : Promise.resolve({ count: null as number | null }),
    ]);

    // ── Personal goals (mkt_goals owned by this user) ─────────────────────
    const { data: memberships } = await supabase
      .from("mkt_space_members").select("space_id").eq("user_id", userId);
    const mySpaceIds = [...new Set((memberships ?? []).map((m: any) => m.space_id))];
    const { data: goalRows } = mySpaceIds.length
      ? await supabase.from("mkt_goals")
          .select("id, title, target, space_id, period_start, period_end")
          .eq("owner_id", userId).in("space_id", mySpaceIds)
      : { data: [] as any[] };
    const goals = (goalRows ?? []).map((g: any) => {
      const progress = (tasks ?? []).filter((t) => {
        if (!t.completed_at) return false;
        if (listMap.get(t.list_id)?.space_id !== g.space_id) return false;
        const day = t.completed_at.slice(0, 10);
        return day >= g.period_start && day <= g.period_end;
      }).length;
      return { id: g.id, title: g.title, target: g.target, progress, period_start: g.period_start, period_end: g.period_end };
    });

    // ── Cycle time, estimate accuracy, open capacity ─────────────────────
    const doneTasks = (tasks ?? []).filter((t) => inWindow(t.completed_at));
    const doneIds = new Set(doneTasks.map((t) => t.id));
    let cycleSum = 0;
    let cycleN = 0;
    let estimatedMin = 0;
    for (const t of doneTasks) {
      if (t.created_at && t.completed_at) {
        const ms = Date.parse(t.completed_at) - Date.parse(t.created_at);
        if (Number.isFinite(ms) && ms >= 0) { cycleSum += ms; cycleN++; }
      }
      if (t.estimate_minutes) estimatedMin += t.estimate_minutes;
    }
    const loggedMinOnDone = (entries ?? [])
      .filter((e: any) => e.task_id && doneIds.has(e.task_id))
      .reduce((a: number, e: any) => a + (e.minutes || 0), 0);
    const openEstimateMin = (tasks ?? [])
      .filter((t) => !t.completed_at && t.estimate_minutes)
      .reduce((a, t) => a + (t.estimate_minutes || 0), 0);

    // ── Daily series (hours + tasks done) ─────────────────────────────────
    const days = [...new Set([...Object.keys(minutesDaily), ...Object.keys(doneDaily)])].sort();
    const daily = days.map((d) => ({
      date: d,
      minutes: minutesDaily[d] || 0,
      tasksDone: doneDaily[d] || 0,
    }));

    const hoursLogged = Math.round((minutesLogged / 60) * 10) / 10;

    return NextResponse.json({
      success: true,
      kind: "workspace",
      summary: {
        tasksDone: done,
        tasksOpen: open,
        overdueNow,
        onTimeRate: cur.onTimeRate,
        hoursLogged,
        activityCount: activityCount ?? 0,
      },
      deltas: prevOk
        ? {
            tasksDone: prev.done,
            hoursLogged: Math.round((prevMinutes / 60) * 10) / 10,
            activityCount: prevActivityCount ?? 0,
            onTimeRate: prev.onTimeRate,
          }
        : null,
      priorityMix,
      goals,
      delivery: {
        cycleTimeDays: cycleN ? Math.round((cycleSum / cycleN / 86_400_000) * 10) / 10 : null,
        estimatedMin,
        loggedMinOnDone,
        openEstimateMin,
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
