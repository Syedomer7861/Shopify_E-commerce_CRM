import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing, requireWorkspaceAdmin } from "@/lib/marketing-auth";

const CreateSpaceSchema = z.object({
  name: z.string().min(1).max(120),
  color: z.string().max(20).optional(),
  icon: z.string().max(40).optional(),
});

// GET /api/marketing/spaces — the Spaces the caller can see, with my_role + member_count.
export async function GET(_req: NextRequest) {
  const { errorResponse, supabase, user } = await requireMarketing();
  if (errorResponse) return errorResponse;

  // RLS already restricts mkt_spaces to accessible rows.
  const { data: spaces, error } = await supabase!
    .from("mkt_spaces")
    .select("*")
    .eq("archived", false)
    .order("position", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (spaces ?? []).map((s) => s.id);
  const { data: mine } = ids.length
    ? await supabase!.from("mkt_space_members").select("space_id, role").eq("user_id", user!.id).in("space_id", ids)
    : { data: [] as Array<{ space_id: string; role: string }> };
  const roleBySpace = new Map((mine ?? []).map((m) => [m.space_id, m.role]));

  const counts = await Promise.all(
    ids.map((id) =>
      supabase!.from("mkt_space_members").select("user_id", { count: "exact", head: true }).eq("space_id", id)
    )
  );

  const out = (spaces ?? []).map((s, i) => ({
    ...s,
    my_role: roleBySpace.get(s.id) ?? null,
    member_count: counts[i]?.count ?? 0,
  }));
  return NextResponse.json(out);
}

// POST /api/marketing/spaces — create a Space (workspace-admin only). Creator becomes owner.
export async function POST(req: NextRequest) {
  const { errorResponse, supabase, user } = await requireWorkspaceAdmin();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateSpaceSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: last } = await supabase!
    .from("mkt_spaces")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: space, error } = await supabase!
    .from("mkt_spaces")
    .insert({
      name: parsed.data.name,
      color: parsed.data.color ?? null,
      icon: parsed.data.icon ?? null,
      position: (last?.position ?? 0) + 1000,
      created_by: user!.id,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase!
    .from("mkt_space_members")
    .insert({ space_id: space.id, user_id: user!.id, role: "owner", added_by: user!.id });

  return NextResponse.json({ ...space, my_role: "owner", member_count: 1 }, { status: 201 });
}
