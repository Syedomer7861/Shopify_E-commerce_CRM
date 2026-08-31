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
  name: z.string().min(1).max(120),
  color: z.string().max(20).optional(),
  icon: z.string().max(40).optional(),
  statuses: z.array(StatusSchema).min(1).optional(),
  wip_limit: z.number().int().positive().nullable().optional(),
});

// GET /api/marketing/lists — board columns. ?archived=1 to include archived.
export async function GET(req: NextRequest) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const includeArchived = new URL(req.url).searchParams.get("archived") === "1";
  let query = supabase!.from("mkt_lists").select("*").order("position", { ascending: true });
  if (!includeArchived) query = query.eq("archived", false);

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
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? 0) + 1000;

  const insert: Record<string, unknown> = {
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
