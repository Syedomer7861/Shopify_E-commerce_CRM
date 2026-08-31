import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

const PatchGoalSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  target: z.number().int().positive().max(100000).optional(),
  period_start: z.string().date().optional(),
  period_end: z.string().date().optional(),
  owner_id: z.string().uuid().nullable().optional(),
});

type Ctx = { params: { id: string } };

// PATCH /api/marketing/goals/:id — RLS restricts to Space owner / workspace admin
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PatchGoalSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_goals")
    .update(parsed.data)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

// DELETE /api/marketing/goals/:id
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { error } = await supabase!.from("mkt_goals").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 500 });
  return NextResponse.json({ ok: true });
}
