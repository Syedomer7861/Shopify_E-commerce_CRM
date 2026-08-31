import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

const StatusSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  type: z.enum(["not_started", "active", "done"]),
});

const FieldSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  type: z.enum(["text", "number", "money", "select", "date", "checkbox", "url", "user"]),
  options: z.array(z.string().max(80)).optional(),
});

const PatchListSchema = z
  .object({
    name: z.string().min(1).max(120),
    color: z.string().max(20).nullable(),
    icon: z.string().max(40).nullable(),
    position: z.number(),
    archived: z.boolean(),
    statuses: z.array(StatusSchema).min(1),
    custom_fields: z.array(FieldSchema).max(30),
    wip_limit: z.number().int().positive().nullable(),
  })
  .partial();

type Ctx = { params: { id: string } };

// PATCH /api/marketing/lists/:id
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_lists")
    .update(parsed.data)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/marketing/lists/:id — archives by default; ?hard=1 removes it
// (cascades to its tasks). Archive is the safe default.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const hard = new URL(req.url).searchParams.get("hard") === "1";

  if (hard) {
    const { error } = await supabase!.from("mkt_lists").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { data, error } = await supabase!
    .from("mkt_lists")
    .update({ archived: true })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, archived: true, list: data });
}
