import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePrivileged } from "@/lib/auth-utils";
import { getEscalationLevel } from "@/lib/task-engine";
import { notifyUser } from "@/lib/notifications-server";

// SLA escalation: a task that's sat open past its due date too long gets
// flagged - the assigned agent is nudged, and a badly overdue one also
// notifies managers/admins, instead of it silently aging in a queue no
// one is re-checking. getEscalationLevel() already existed in
// task-engine.ts (used for priority scoring) but had no caller that
// actually escalated anything - this is that caller.
//
// escalated_at marks a task as already notified so re-runs (daily, per
// cron.yml) don't re-notify it. Capped per run so a first-time backlog
// (hundreds of already-overdue tasks) doesn't flood everyone's
// notification bell at once - the cap just means the backlog clears
// gradually over a few days instead of one big dump.
const BATCH_LIMIT = 40;
const HIGH_THRESHOLD_DAYS = 3;   // matches getEscalationLevel's "high"
const CRITICAL_THRESHOLD_DAYS = 7; // matches getEscalationLevel's "critical"

export async function POST(req: NextRequest) {
  const unauthorized = await requirePrivileged(req, ["manage_automations"]);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const today = new Date();
  const highCutoff = new Date(today.getTime() - HIGH_THRESHOLD_DAYS * 86400000).toISOString().split("T")[0];
  // Ops/testing escape hatch: escalate exactly one task by id instead of
  // scanning the real backlog - lets this route be exercised against a
  // single known task without notifying the rest of the real queue.
  const onlyTaskId = req.nextUrl.searchParams.get("taskId");

  try {
    let query = supabase
      .from("tasks")
      .select("id, task_type, due_date, assigned_to, customer:customers(name)")
      .is("escalated_at", null);

    if (onlyTaskId) {
      query = query.eq("id", onlyTaskId);
    } else {
      query = query
        .in("status", ["pending", "due", "overdue", "rescheduled"])
        .lt("due_date", highCutoff)
        .limit(BATCH_LIMIT);
    }

    const { data: candidates, error } = await query;

    if (error) throw error;
    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ escalated: 0, message: "No newly-overdue tasks past the SLA threshold" });
    }

    let managerIds: string[] | null = null;
    let escalated = 0;

    for (const task of candidates) {
      const overdueDays = Math.floor((today.getTime() - new Date(task.due_date).getTime()) / 86400000);
      const level = getEscalationLevel(overdueDays);
      if (level !== "high" && level !== "critical") continue; // stale/borderline row, leave for next run

      const customerName = (task.customer as any)?.name || "a customer";
      const taskLabel = String(task.task_type || "task").replace(/_/g, " ");

      if (task.assigned_to) {
        await notifyUser(
          task.assigned_to,
          `Overdue: ${taskLabel} (${overdueDays}d)`,
          `Your ${taskLabel} task for ${customerName} is ${overdueDays} days overdue.`,
          `/tasks?id=${task.id}`,
          level === "critical" ? "alert" : "warning"
        );
      }

      if (level === "critical") {
        if (managerIds === null) {
          const { data: managers } = await supabase.from("profiles").select("id").in("role", ["manager", "admin"]);
          managerIds = (managers || []).map(m => m.id);
        }
        for (const managerId of managerIds) {
          await notifyUser(
            managerId,
            `Task critically overdue (${overdueDays}d)`,
            `${taskLabel} task for ${customerName} has been open ${overdueDays} days with no resolution.`,
            `/tasks?id=${task.id}`,
            "alert"
          );
        }
      }

      await supabase.from("tasks").update({ escalated_at: new Date().toISOString() } as any).eq("id", task.id);
      escalated++;
    }

    return NextResponse.json({ escalated, scanned: candidates.length });
  } catch (err: any) {
    console.error("[SLA-ESCALATOR] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
