import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

const StatusSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  type: z.enum(["not_started", "active", "done"]),
});

const CreateListSchema = z.object({
  space_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  color: z.string().max(20).optional(),
  icon: z.string().max(40).optional(),
  statuses: z.array(StatusSchema).min(1).optional(),
  wip_limit: z.number().int().positive().nullable().optional(),
});

// GET /api/marketing/lists?space_id=&archived=1 — a Space's board lists.
// RLS already limits rows to Spaces the caller can access.
export async function GET(req: NextRequest) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const sp = new URL(req.url).searchParams;
  const includeArchived = sp.get("archived") === "1";
  const spaceId = sp.get("space_id");

  let query = supabase!.from("mkt_lists").select("*").order("position", { ascending: true });
  if (!includeArchived) query = query.eq("archived", false);
  if (spaceId) query = query.eq("space_id", spaceId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/marketing/lists — create a list
export async function POST(req: NextRequest) {
  const { errorResponse, supabase, user } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: last } = await supabase!
    .from("mkt_lists")
    .select("position")
    .eq("space_id", parsed.data.space_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? 0) + 1000;

  const insert: Record<string, unknown> = {
    space_id: parsed.data.space_id,
    name: parsed.data.name,
    color: parsed.data.color ?? null,
    icon: parsed.data.icon ?? null,
    position,
    created_by: user!.id,
  };
  if (parsed.data.statuses) insert.statuses = parsed.data.statuses;
  if (parsed.data.wip_limit !== undefined) insert.wip_limit = parsed.data.wip_limit;

  const { data, error } = await supabase!.from("mkt_lists").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
