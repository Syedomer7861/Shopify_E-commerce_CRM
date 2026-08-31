import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireInternal } from "@/lib/auth-utils";
import { notifyUser, notifyAdmin } from "@/lib/notifications-server";

// Daily nudge for workspace tasks that blew past their due date and aren't
// done. Two tiers:
//   - overdue at all   -> in-app ping to each assignee
//   - overdue > 2 days  -> escalate: in-app ping to the Space owner(s), plus
//                          one WhatsApp/audit digest to the admin
// One notification per recipient per task per run — run this once a day.
const ESCALATE_AFTER_DAYS = 2;

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];
  const escalateCutoff = new Date(Date.now() - ESCALATE_AFTER_DAYS * 86_400_000)
    .toISOString()
    .split("T")[0];

  const { data: tasks, error } = await supabase
    .from("mkt_tasks")
    .select("id, title, assignees, due_date, list_id")
    .lt("due_date", today)
    .is("completed_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let notified = 0;
  let escalated = 0;

  // Assignee pings (tier 1).
  for (const t of tasks ?? []) {
    for (const uid of (t.assignees as string[] | null) ?? []) {
      await notifyUser(
        uid,
        `Overdue: ${t.title}`,
        `Was due ${t.due_date}`,
        `/workspace?task=${t.id}`,
        "warning"
      ).catch(() => {});
      notified++;
    }
  }

  // Tier 2 — anything stale enough to escalate to Space owners.
  const stale = (tasks ?? []).filter(
    (t) => t.due_date && t.due_date < escalateCutoff && t.list_id
  );

  if (stale.length) {
    const listIds = [...new Set(stale.map((t) => t.list_id as string))];
    const { data: lists } = await supabase
      .from("mkt_lists")
      .select("id, space_id, name")
      .in("id", listIds);
    const listToSpace = new Map<string, string>(
      (lists ?? []).map((l: any) => [l.id, l.space_id])
    );

    const spaceIds = [...new Set((lists ?? []).map((l: any) => l.space_id).filter(Boolean))];
    const { data: owners } = await supabase
      .from("mkt_space_members")
      .select("space_id, user_id")
      .in("space_id", spaceIds)
      .eq("role", "owner");

    const ownersBySpace = new Map<string, string[]>();
    for (const o of owners ?? []) {
      const arr = ownersBySpace.get(o.space_id) ?? [];
      arr.push(o.user_id);
      ownersBySpace.set(o.space_id, arr);
    }

    const staleBySpace = new Map<string, typeof stale>();
    for (const t of stale) {
      const spaceId = listToSpace.get(t.list_id as string);
      if (!spaceId) continue;
      const arr = staleBySpace.get(spaceId) ?? [];
      arr.push(t);
      staleBySpace.set(spaceId, arr);
    }

    for (const [spaceId, spaceTasks] of staleBySpace) {
      for (const ownerId of ownersBySpace.get(spaceId) ?? []) {
        await notifyUser(
          ownerId,
          `${spaceTasks.length} task${spaceTasks.length === 1 ? "" : "s"} in your Space are >${ESCALATE_AFTER_DAYS}d overdue`,
          spaceTasks.slice(0, 5).map((t) => `• ${t.title} (due ${t.due_date})`).join("\n"),
          `/workspace?space=${spaceId}`,
          "alert"
        ).catch(() => {});
        escalated++;
      }
    }

    await notifyAdmin(
      `[WORKSPACE] ${stale.length} task${stale.length === 1 ? "" : "s"} are more than ${ESCALATE_AFTER_DAYS} days overdue across ${staleBySpace.size} Space${staleBySpace.size === 1 ? "" : "s"}.`,
      "alert",
      "workspace_overdue_escalation"
    ).catch(() => {});
  }

  return NextResponse.json({
    overdue: tasks?.length ?? 0,
    notified,
    stale: stale.length,
    escalated,
  });
}

// Vercel Cron / external triggers may use GET.
export const GET = POST;
