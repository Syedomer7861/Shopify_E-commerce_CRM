import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

// Batch position/column updates emitted by a drag-and-drop drop. Kept small
// (one board move touches a handful of cards at most), so per-row updates
// are fine — no bulk-upsert complexity needed.
const ReorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        list_id: z.string().uuid().optional(),
        status: z.string().min(1).max(60).optional(),
        position: z.number(),
      })
    )
    .min(1)
    .max(200),
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
  const parsed = ReorderSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const results = await Promise.all(
    parsed.data.items.map((it) => {
      const patch: Record<string, unknown> = { position: it.position };
      if (it.list_id) patch.list_id = it.list_id;
      if (it.status) patch.status = it.status;
      return supabase!.from("mkt_tasks").update(patch).eq("id", it.id);
    })
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, updated: parsed.data.items.length });
}
