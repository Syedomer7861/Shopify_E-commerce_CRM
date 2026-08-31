import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";
import { notifyUser } from "@/lib/notifications-server";

const AddMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["owner", "member"]).optional(),
});

type Ctx = { params: { id: string } };

// GET /api/marketing/spaces/:id/members
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase!
    .from("mkt_space_members")
    .select("space_id, user_id, role, created_at, user:profiles(id, name, email, role)")
    .eq("space_id", params.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/marketing/spaces/:id/members — add a member (owner / workspace-admin only, via RLS)
export async function POST(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase, user } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = AddMemberSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_space_members")
    .upsert(
      { space_id: params.id, user_id: parsed.data.user_id, role: parsed.data.role ?? "member", added_by: user!.id },
      { onConflict: "space_id,user_id" }
    )
    .select("space_id, user_id, role, created_at, user:profiles(id, name, email, role)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 500 });

  const { data: space } = await supabase!.from("mkt_spaces").select("name").eq("id", params.id).single();
  notifyUser(
    parsed.data.user_id,
    `Added to "${space?.name ?? "a workspace Space"}"`,
    "You now have access to that Space's boards.",
    `/workspace?space=${params.id}`,
    "info"
  ).catch(() => {});

  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/marketing/spaces/:id/members?user_id=...
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const uid = new URL(req.url).searchParams.get("user_id");
  if (!uid) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  // Don't strand a Space with no owner.
  const { data: owners } = await supabase!
    .from("mkt_space_members")
    .select("user_id")
    .eq("space_id", params.id)
    .eq("role", "owner");
  if ((owners ?? []).length <= 1 && (owners ?? []).some((o) => o.user_id === uid)) {
    return NextResponse.json({ error: "Promote another owner before removing the last one" }, { status: 409 });
  }

  const { error } = await supabase!
    .from("mkt_space_members")
    .delete()
    .eq("space_id", params.id)
    .eq("user_id", uid);
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 500 });
  return NextResponse.json({ ok: true });
}
