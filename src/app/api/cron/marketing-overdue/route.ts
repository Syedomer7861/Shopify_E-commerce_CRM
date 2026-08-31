import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireInternal } from "@/lib/auth-utils";
import { notifyUser } from "@/lib/notifications-server";

// Daily nudge for marketing tasks that blew past their due date and aren't
// done. One notification per assignee per task per run — run this once a day.
export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: tasks, error } = await supabase
    .from("mkt_tasks")
    .select("id, title, assignees, due_date")
    .lt("due_date", today)
    .is("completed_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let notified = 0;
  for (const t of tasks ?? []) {
    for (const uid of (t.assignees as string[] | null) ?? []) {
      await notifyUser(
        uid,
        `Overdue: ${t.title}`,
        `Was due ${t.due_date}`,
        `/marketing?task=${t.id}`,
        "warning"
      ).catch(() => {});
      notified++;
    }
  }

  return NextResponse.json({ overdue: tasks?.length ?? 0, notified });
}

// Vercel Cron / external triggers may use GET.
export const GET = POST;
