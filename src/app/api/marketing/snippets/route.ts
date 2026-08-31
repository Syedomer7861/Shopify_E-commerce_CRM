import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing, requireWorkspaceAdmin } from "@/lib/marketing-auth";

const CreateSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(5000),
});

// GET /api/marketing/snippets — any workspace member (for the "/" picker)
export async function GET() {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase!
    .from("mkt_comment_snippets")
    .select("*")
    .order("title", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/marketing/snippets — workspace admin only
export async function POST(req: NextRequest) {
  const { errorResponse, supabase, user } = await requireWorkspaceAdmin();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_comment_snippets")
    .insert({ title: parsed.data.title, body: parsed.data.body, created_by: user!.id })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
