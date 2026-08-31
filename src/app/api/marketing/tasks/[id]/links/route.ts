import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

const CreateLinkSchema = z.object({
  target_task_id: z.string().uuid(),
  kind: z.enum(["blocks", "blocked_by", "relates_to"]),
});

type Ctx = { params: { id: string } };

const INVERSE: Record<string, string> = { blocks: "blocked_by", blocked_by: "blocks", relates_to: "relates_to" };

// GET /api/marketing/tasks/:id/links — outgoing + incoming, with target titles
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const [out, inc] = await Promise.all([
    supabase!
      .from("mkt_task_links")
      .select("id, kind, target:mkt_tasks!mkt_task_links_target_task_id_fkey(id, title, status, list_id)")
      .eq("task_id", params.id),
    supabase!
      .from("mkt_task_links")
      .select("id, kind, source:mkt_tasks!mkt_task_links_task_id_fkey(id, title, status, list_id)")
      .eq("target_task_id", params.id),
  ]);

  const links = [
    ...((out.data ?? []).map((l: any) => ({ id: l.id, kind: l.kind, direction: "out", task: l.target }))),
    ...((inc.data ?? []).map((l: any) => ({ id: l.id, kind: INVERSE[l.kind] ?? l.kind, direction: "in", task: l.source }))),
  ];
  return NextResponse.json(links);
}

// POST /api/marketing/tasks/:id/links
export async function POST(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateLinkSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.target_task_id === params.id) {
    return NextResponse.json({ error: "A task can't depend on itself" }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_task_links")
    .insert({ task_id: params.id, target_task_id: parsed.data.target_task_id, kind: parsed.data.kind })
    .select("id, kind")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That link already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/marketing/tasks/:id/links?link_id=...
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const linkId = new URL(req.url).searchParams.get("link_id");
  if (!linkId) return NextResponse.json({ error: "link_id required" }, { status: 400 });

  // Allow deleting a link whether this task is its source or its target.
  const { error } = await supabase!
    .from("mkt_task_links")
    .delete()
    .eq("id", linkId)
    .or(`task_id.eq.${params.id},target_task_id.eq.${params.id}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
