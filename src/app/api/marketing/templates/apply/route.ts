import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

const ApplySchema = z.object({
  template_id: z.string().uuid(),
  list_id: z.string().uuid().optional(), // required for kind='task'
  space_id: z.string().uuid().optional(), // required for kind='list'
});

type TplTask = {
  title: string;
  priority?: "urgent" | "high" | "normal" | "low";
  status?: string;
  tags?: string[];
  description?: string;
};

// POST /api/marketing/templates/apply
//   kind 'list' → creates a new list + its seed tasks
//   kind 'task' → appends the template's tasks to an existing list (list_id)
export async function POST(req: NextRequest) {
  const { errorResponse, supabase, user } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: tpl, error: tplErr } = await supabase!
    .from("mkt_templates")
    .select("*")
    .eq("id", parsed.data.template_id)
    .single();
  if (tplErr || !tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const payload = (tpl.payload ?? {}) as Record<string, any>;
  const tplTasks: TplTask[] = Array.isArray(payload.tasks) ? payload.tasks : [];

  const buildRows = (listId: string, statusIds: string[], startPos: Record<string, number>) => {
    const posByStatus = { ...startPos };
    return tplTasks.map((t) => {
      const status = t.status && statusIds.includes(t.status) ? t.status : statusIds[0];
      posByStatus[status] = (posByStatus[status] ?? 0) + 1000;
      return {
        list_id: listId,
        title: t.title,
        description: t.description ?? null,
        status,
        priority: t.priority ?? "normal",
        tags: t.tags ?? [],
        position: posByStatus[status],
        created_by: user!.id,
      };
    });
  };

  if (tpl.kind === "list") {
    if (!parsed.data.space_id) {
      return NextResponse.json({ error: "space_id is required for a list template" }, { status: 400 });
    }
    const statuses = Array.isArray(payload.statuses) ? payload.statuses : undefined;
    const statusIds: string[] = statuses ? statuses.map((s: any) => s.id) : ["backlog"];

    const { data: lastList } = await supabase!
      .from("mkt_lists")
      .select("position")
      .eq("space_id", parsed.data.space_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const listInsert: Record<string, unknown> = {
      space_id: parsed.data.space_id,
      name: tpl.name,
      color: payload.color ?? null,
      icon: payload.icon ?? null,
      position: (lastList?.position ?? 0) + 1000,
      created_by: user!.id,
    };
    if (statuses) listInsert.statuses = statuses;

    const { data: list, error: listErr } = await supabase!
      .from("mkt_lists")
      .insert(listInsert)
      .select("*")
      .single();
    if (listErr || !list) {
      return NextResponse.json({ error: listErr?.message ?? "Could not create list" }, { status: 500 });
    }

    let taskCount = 0;
    if (tplTasks.length) {
      const rows = buildRows(list.id, statusIds, {});
      const { error: taskErr, count } = await supabase!
        .from("mkt_tasks")
        .insert(rows, { count: "exact" });
      if (taskErr) {
        return NextResponse.json({ error: `List created, tasks failed: ${taskErr.message}`, list }, { status: 207 });
      }
      taskCount = count ?? rows.length;
    }

    return NextResponse.json({ list, taskCount }, { status: 201 });
  }

  // kind === 'task'
  if (!parsed.data.list_id) {
    return NextResponse.json({ error: "list_id is required for a task template" }, { status: 400 });
  }
  const { data: list, error: listErr } = await supabase!
    .from("mkt_lists")
    .select("id, statuses")
    .eq("id", parsed.data.list_id)
    .single();
  if (listErr || !list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  const statusIds: string[] = Array.isArray(list.statuses)
    ? (list.statuses as Array<{ id: string }>).map((s) => s.id)
    : ["backlog"];

  // Append after whatever is already in the first column.
  const { data: last } = await supabase!
    .from("mkt_tasks")
    .select("position")
    .eq("list_id", list.id)
    .eq("status", statusIds[0])
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rows = buildRows(list.id, statusIds, { [statusIds[0]]: last?.position ?? 0 });
  const { error: taskErr, count } = await supabase!.from("mkt_tasks").insert(rows, { count: "exact" });
  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });

  return NextResponse.json({ list_id: list.id, taskCount: count ?? rows.length }, { status: 201 });
}
