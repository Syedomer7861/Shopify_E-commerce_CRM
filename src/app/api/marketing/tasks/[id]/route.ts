import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDays, addWeeks, addMonths, formatISO } from "date-fns";
import { requireMarketing } from "@/lib/marketing-auth";
import { runStatusAutomations } from "@/lib/marketing-automations";

const RECURRENCE_FREQ = ["daily", "weekly", "monthly"] as const;

function nextDueDate(due: string, freq: string): string {
  const base = new Date(due + "T00:00:00");
  const next = freq === "weekly" ? addWeeks(base, 1) : freq === "monthly" ? addMonths(base, 1) : addDays(base, 1);
  return formatISO(next, { representation: "date" });
}

const PatchTaskSchema = z
  .object({
    title: z.string().min(1).max(2000),
    description: z.string().max(20000).nullable(),
    list_id: z.string().uuid(),
    status: z.string().min(1).max(60),
    priority: z.enum(["urgent", "high", "normal", "low"]),
    start_date: z.string().date().nullable(),
    due_date: z.string().date().nullable(),
    assignees: z.array(z.string().uuid()),
    watchers: z.array(z.string().uuid()),
    tags: z.array(z.string().max(40)),
    position: z.number(),
    custom_fields: z.record(z.string(), z.any()),
    source_ref: z.record(z.string(), z.any()).nullable(),
    recurrence: z.object({ freq: z.enum(RECURRENCE_FREQ) }).nullable(),
  })
  .partial();

type Ctx = { params: { id: string } };

// GET /api/marketing/tasks/:id — full task with subtasks, comments, links
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { data: task, error } = await supabase!.from("mkt_tasks").select("*").eq("id", params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const [subs, comments, links] = await Promise.all([
    supabase!.from("mkt_tasks").select("*").eq("parent_task_id", params.id).order("position", { ascending: true }),
    supabase!
      .from("mkt_comments")
      .select("*, author:profiles(id, name, email, role)")
      .eq("task_id", params.id)
      .order("created_at", { ascending: true }),
    supabase!.from("mkt_task_links").select("*").eq("task_id", params.id),
  ]);

  return NextResponse.json({
    ...task,
    subtasks: subs.data ?? [],
    comments: comments.data ?? [],
    links: links.data ?? [],
  });
}

// PATCH /api/marketing/tasks/:id
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase, user, profile } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const patch: Record<string, unknown> = { ...parsed.data };
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: current, error: curErr } = await supabase!
    .from("mkt_tasks")
    .select(
      "id, list_id, status, title, due_date, recurrence, parent_task_id, priority, assignees, watchers, tags, description"
    )
    .eq("id", params.id)
    .single();
  if (curErr || !current) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  // Stamp / clear completed_at when the status moves in or out of a
  // 'done'-type column of its (possibly new) list.
  let movedToDone = false;
  let doneListStatuses: Array<{ id: string; name?: string; type: string }> = [];
  if (typeof patch.status === "string" && patch.status !== current.status) {
    const listId = (patch.list_id as string) ?? current.list_id;
    const { data: list } = await supabase!.from("mkt_lists").select("statuses").eq("id", listId).single();
    doneListStatuses = (list?.statuses as Array<{ id: string; name?: string; type: string }> | undefined) ?? [];
    movedToDone = doneListStatuses.find((s) => s.id === patch.status)?.type === "done";
    patch.completed_at = movedToDone ? new Date().toISOString() : null;
  }
  const statusName = (id?: string) => doneListStatuses.find((s) => s.id === id)?.name ?? id ?? "";

  const { data, error } = await supabase!
    .from("mkt_tasks")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Status changed → run matching automations (assign / notify / priority /
  // subtask). Best-effort: never fail the update on an automation error.
  if (typeof patch.status === "string" && patch.status !== current.status) {
    try {
      await runStatusAutomations(supabase!, {
        task: {
          id: data.id,
          list_id: data.list_id,
          title: data.title,
          status: data.status,
          assignees: data.assignees,
          watchers: data.watchers,
        },
        toStatus: patch.status,
        actorId: user!.id,
      });
    } catch {
      /* automations are non-critical */
    }
  }

  // Recurring task just completed → spawn the next occurrence. Only for
  // top-level tasks with a due date and a recurrence rule. Best-effort:
  // a clone failure must not fail the completion itself.
  const recurrence = (patch.recurrence ?? current.recurrence) as { freq?: string } | null;
  if (movedToDone && recurrence?.freq && current.due_date && !current.parent_task_id) {
    try {
      const openStatus = doneListStatuses.find((s) => s.type !== "done")?.id ?? current.status;
      const { data: last } = await supabase!
        .from("mkt_tasks")
        .select("position")
        .eq("list_id", current.list_id)
        .eq("status", openStatus)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      await supabase!.from("mkt_tasks").insert({
        list_id: current.list_id,
        title: current.title,
        description: current.description ?? null,
        status: openStatus,
        priority: current.priority ?? "normal",
        due_date: nextDueDate(current.due_date, recurrence.freq),
        assignees: current.assignees ?? [],
        watchers: current.watchers ?? [],
        tags: current.tags ?? [],
        recurrence,
        position: (last?.position ?? 0) + 1000,
        created_by: user!.id,
      });
    } catch {
      /* next-occurrence spawn is non-critical */
    }
  }

  // Best-effort activity trail — never fail the request on a log write.
  try {
    const changed = Object.keys(parsed.data);
    const statusMoved = typeof patch.status === "string" && patch.status !== current.status;
    const fromName = statusName(current.status);
    const toName = statusName(patch.status as string);
    await supabase!.from("audit_logs").insert({
      actor_id: user!.id,
      actor_email: profile?.email ?? null,
      entity_type: "mkt_task",
      entity_id: params.id,
      action: statusMoved ? "mkt_task_status_changed" : "mkt_task_updated",
      summary: statusMoved
        ? `Moved from "${fromName}" to "${toName}"`
        : `Updated ${changed.filter((k) => k !== "position").join(", ") || "task"}`,
      metadata: {
        changed,
        from_status: current.status,
        to_status: patch.status ?? current.status,
        from_status_name: statusMoved ? fromName : undefined,
        to_status_name: statusMoved ? toName : undefined,
      },
    });
  } catch {
    /* activity log is non-critical */
  }

  return NextResponse.json(data);
}

// DELETE /api/marketing/tasks/:id — hard delete (subtasks/comments cascade)
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase, user, profile } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { error } = await supabase!.from("mkt_tasks").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await supabase!.from("audit_logs").insert({
      actor_id: user!.id,
      actor_email: profile?.email ?? null,
      entity_type: "mkt_task",
      entity_id: params.id,
      action: "mkt_task_deleted",
      summary: "Deleted a marketing task",
    });
  } catch {
    /* non-critical */
  }

  return NextResponse.json({ ok: true });
}
