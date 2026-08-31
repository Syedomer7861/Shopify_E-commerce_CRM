import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

// Batch edit / delete for multi-select in the List and Table views. RLS
// still enforces per-Space write access on each row.
const BulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["update", "delete"]),
  patch: z
    .object({
      status: z.string().min(1).max(60),
      priority: z.enum(["urgent", "high", "normal", "low"]),
      assignees: z.array(z.string().uuid()),
      due_date: z.string().date().nullable(),
      add_tags: z.array(z.string().max(40)),
    })
    .partial()
    .optional(),
});

export async function POST(req: NextRequest) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BulkSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const { ids, action, patch } = parsed.data;

  if (action === "delete") {
    const { error } = await supabase!.from("mkt_tasks").delete().in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: ids.length });
  }

  if (!patch || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // add_tags is per-row (append), so it can't ride the single .update() below.
  const { add_tags, ...flat } = patch;

  if (Object.keys(flat).length) {
    const { error } = await supabase!.from("mkt_tasks").update(flat).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (add_tags?.length) {
    const { data: rows } = await supabase!.from("mkt_tasks").select("id, tags").in("id", ids);
    await Promise.all(
      (rows ?? []).map((r) =>
        supabase!
          .from("mkt_tasks")
          .update({ tags: Array.from(new Set([...((r.tags as string[]) ?? []), ...add_tags])) })
          .eq("id", r.id)
      )
    );
  }

  return NextResponse.json({ ok: true, updated: ids.length });
}
