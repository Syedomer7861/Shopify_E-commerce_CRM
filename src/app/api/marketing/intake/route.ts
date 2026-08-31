import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedSession } from "@/lib/auth-utils";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { notifyUser } from "@/lib/notifications-server";

const CreateIntakeSchema = z.object({
  title: z.string().min(1).max(300),
  details: z.string().max(5000).optional(),
  desired_date: z.string().date().nullable().optional(),
  ref: z.record(z.string(), z.any()).nullable().optional(),
});

// GET /api/marketing/intake — workspace staff see the whole queue; everyone
// else sees only the requests they filed (so they can follow up). RLS on
// mkt_intake_requests enforces the same split.
export async function GET() {
  const { errorResponse, user, profile, supabase } = await getAuthenticatedSession();
  if (errorResponse) return errorResponse;

  let staff = isWorkspaceAdmin(profile);
  if (!staff) {
    const { count } = await supabase!
      .from("mkt_space_members")
      .select("space_id", { count: "exact", head: true })
      .eq("user_id", user!.id);
    staff = !!count;
  }

  let query = supabase!
    .from("mkt_intake_requests")
    .select("*, requester:profiles(id, name, email, role)")
    .order("created_at", { ascending: false });
  if (!staff) query = query.eq("requester_id", user!.id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/marketing/intake — anyone signed in can file a request
export async function POST(req: NextRequest) {
  const { errorResponse, user, supabase } = await getAuthenticatedSession();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateIntakeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_intake_requests")
    .insert({
      requester_id: user!.id,
      title: parsed.data.title,
      details: parsed.data.details ?? null,
      desired_date: parsed.data.desired_date ?? null,
      ref: parsed.data.ref ?? null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ping the marketing team (best-effort).
  try {
    const admin = (await import("@/lib/supabase")).createAdminClient();
    const { data: staff } = await admin
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .or("role.eq.marketing,role.eq.admin");
    await Promise.allSettled(
      (staff ?? []).map((s: any) =>
        notifyUser(s.id, "New creative request", parsed.data.title.slice(0, 140), "/marketing?intake=1", "info")
      )
    );
  } catch {
    /* notification is non-critical */
  }

  return NextResponse.json(data, { status: 201 });
}
