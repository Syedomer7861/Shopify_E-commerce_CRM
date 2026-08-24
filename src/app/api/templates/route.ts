import { NextRequest, NextResponse } from "next/server";
import { ensureAdmin } from "@/lib/auth-utils";

/**
 * GET /api/templates
 * POST /api/templates
 * DELETE /api/templates?id=<id>
 *
 * Admin-only: these templates feed WhatsApp broadcast campaigns, which are
 * gated to admins on the frontend - requireInternal() only checked "is
 * someone logged in," so any authenticated non-admin could hit this
 * directly and edit what customers receive.
 */
export async function GET() {
  const { errorResponse, supabase } = await ensureAdmin();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase!
    .from("campaign_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

export async function POST(req: NextRequest) {
  const { errorResponse, supabase } = await ensureAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json();
  const { data, error } = await supabase!
    .from("campaign_templates")
    .upsert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, template: data });
}

export async function DELETE(req: NextRequest) {
  const { errorResponse, supabase } = await ensureAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const { error } = await supabase!.from("campaign_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
