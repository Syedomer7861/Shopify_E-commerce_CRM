import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

const PatchSchema = z
  .object({
    name: z.string().min(1).max(160),
    enabled: z.boolean(),
    list_id: z.string().uuid().nullable(),
    trigger: z.object({ event: z.literal("status_changed"), to: z.string().min(1).max(60).optional() }),
    actions: z.array(z.record(z.string(), z.any())).min(1),
  })
  .partial();

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing valid to update" }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_automations")
    .update(parsed.data)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { error } = await supabase!.from("mkt_automations").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
