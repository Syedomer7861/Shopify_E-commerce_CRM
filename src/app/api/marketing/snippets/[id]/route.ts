import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceAdmin } from "@/lib/marketing-auth";

const PatchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(5000).optional(),
});

type Ctx = { params: { id: string } };

// PATCH /api/marketing/snippets/:id — workspace admin
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireWorkspaceAdmin();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_comment_snippets")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

// DELETE /api/marketing/snippets/:id — workspace admin
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireWorkspaceAdmin();
  if (errorResponse) return errorResponse;

  const { error } = await supabase!.from("mkt_comment_snippets").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
