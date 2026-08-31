import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";
import { runAutomations } from "@/lib/marketing-automations";

const CreateTaskSchema = z.object({
  list_id: z.string().uuid(),
  title: z.string().min(1).max(2000),
  description: z.string().max(20000).optional(),
  status: z.string().min(1).max(60).optional(),
  priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
  start_date: z.string().date().nullable().optional(),
  due_date: z.string().date().nullable().optional(),
  assignees: z.array(z.string().uuid()).optional(),
  watchers: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string().max(40)).optional(),
  parent_task_id: z.string().uuid().nullable().optional(),
  source_ref: z.record(z.string(), z.any()).nullable().optional(),
});

// GET /api/marketing/tasks?list_id=&status=&assignee=&tag=&priority=&due_before=&q=&include=subtasks
export async function GET(req: NextRequest) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const sp = new URL(req.url).searchParams;
  const listId = sp.get("list_id");
  const status = sp.get("status");
  const assignee = sp.get("assignee");
  const tag = sp.get("tag");
  const priority = sp.get("priority");
  const dueBefore = sp.get("due_before");
  const q = sp.get("q");
  const includeSubtasks = sp.get("include") === "subtasks";

  let query = supabase!
    .from("mkt_tasks")
    .select("*")
    .order("position", { ascending: true });

  if (listId) query = query.eq("list_id", listId);
  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  if (assignee) query = query.contains("assignees", [assignee]);
  if (tag) query = query.contains("tags", [tag]);
  if (dueBefore) query = query.lte("due_date", dueBefore);
  if (q) query = query.ilike("title", `%${q}%`);
  // Board/List views show top-level cards only unless explicitly asked.
  if (!includeSubtasks) query = query.is("parent_task_id", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/marketing/tasks — create task or subtask
export async function POST(req: NextRequest) {
  const { errorResponse, supabase, user, profile } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // Resolve default status from the target list's first column.
  const { data: list, error: listErr } = await supabase!
    .from("mkt_lists")
    .select("id, statuses")
    .eq("id", input.list_id)
    .single();
  if (listErr || !list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  const statusIds: string[] = Array.isArray(list.statuses)
    ? (list.statuses as Array<{ id: string }>).map((s) => s.id)
    : [];
  const status = input.status && statusIds.includes(input.status) ? input.status : statusIds[0] ?? "backlog";

  // Append to the end of its column.
  const { data: last } = await supabase!
    .from("mkt_tasks")
    .select("position")
    .eq("list_id", input.list_id)
    .eq("status", status)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? 0) + 1000;

  const insert: Record<string, unknown> = {
    list_id: input.list_id,
    title: input.title,
    description: input.description ?? null,
    status,
    priority: input.priority ?? "normal",
    start_date: input.start_date ?? null,
    due_date: input.due_date ?? null,
    assignees: input.assignees ?? [],
    watchers: input.watchers ?? [],
    tags: input.tags ?? [],
    parent_task_id: input.parent_task_id ?? null,
    source_ref: input.source_ref ?? null,
    position,
    created_by: user!.id,
  };

  const { data, error } = await supabase!.from("mkt_tasks").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await supabase!.from("audit_logs").insert({
      actor_id: user!.id,
      actor_email: profile?.email ?? null,
      entity_type: "mkt_task",
      entity_id: data.id,
      action: input.parent_task_id ? "mkt_subtask_created" : "mkt_task_created",
      summary: `Created "${input.title}"`,
    });
  } catch {
    /* activity log is non-critical */
  }

  if (!input.parent_task_id) {
    try {
      await runAutomations(supabase!, {
        event: "task_created",
        task: { id: data.id, list_id: data.list_id, title: data.title, status: data.status, assignees: data.assignees, custom_fields: data.custom_fields },
        actorId: user!.id,
      });
    } catch {
      /* automations are non-critical */
    }
  }

  return NextResponse.json(data, { status: 201 });
}
