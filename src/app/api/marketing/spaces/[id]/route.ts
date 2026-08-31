import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

const PatchSpaceSchema = z
  .object({
    name: z.string().min(1).max(120),
    color: z.string().max(20).nullable(),
    icon: z.string().max(40).nullable(),
    position: z.number(),
    archived: z.boolean(),
  })
  .partial();

type Ctx = { params: { id: string } };

// PATCH /api/marketing/spaces/:id — rename / recolor / archive. RLS
// (is_space_owner) enforces that only an owner or workspace-admin can write.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PatchSpaceSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing valid to update" }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_spaces")
    .update(parsed.data)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found or not permitted" }, { status: 404 });
  return NextResponse.json(data);
}

// DELETE /api/marketing/spaces/:id — hard delete (cascades lists/tasks).
// RLS restricts this to workspace-admins.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { error } = await supabase!.from("mkt_spaces").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
