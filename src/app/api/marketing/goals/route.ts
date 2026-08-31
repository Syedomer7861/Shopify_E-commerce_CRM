import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

const CreateGoalSchema = z.object({
  space_id: z.string().uuid(),
  title: z.string().min(1).max(300),
  target: z.number().int().positive().max(100000),
  period_start: z.string().date(),
  period_end: z.string().date(),
  owner_id: z.string().uuid().nullable().optional(),
});

// Count done tasks in a Space within [start, end], optionally for one assignee.
async function computeProgress(
  supabase: any,
  spaceId: string,
  start: string,
  end: string,
  ownerId?: string | null
): Promise<number> {
  const { data: lists } = await supabase
    .from("mkt_lists")
    .select("id")
    .eq("space_id", spaceId);
  const listIds = (lists ?? []).map((l: any) => l.id);
  if (listIds.length === 0) return 0;

  let q = supabase
    .from("mkt_tasks")
    .select("id", { count: "exact", head: true })
    .in("list_id", listIds)
    .not("completed_at", "is", null)
    .gte("completed_at", `${start}T00:00:00.000Z`)
    .lte("completed_at", `${end}T23:59:59.999Z`);
  if (ownerId) q = q.contains("assignees", [ownerId]);

  const { count } = await q;
  return count ?? 0;
}

// GET /api/marketing/goals?space_id=... — goals for a Space, with computed progress
export async function GET(req: NextRequest) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const spaceId = req.nextUrl.searchParams.get("space_id");
  if (!spaceId) return NextResponse.json({ error: "space_id is required" }, { status: 400 });

  const { data: goals, error } = await supabase!
    .from("mkt_goals")
    .select("*")
    .eq("space_id", spaceId)
    .order("period_end", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withProgress = await Promise.all(
    (goals ?? []).map(async (g: any) => ({
      ...g,
      progress: await computeProgress(supabase!, g.space_id, g.period_start, g.period_end, g.owner_id),
    }))
  );
  return NextResponse.json(withProgress);
}

// POST /api/marketing/goals — create (Space owner / workspace admin, enforced by RLS)
export async function POST(req: NextRequest) {
  const { errorResponse, supabase, user } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateGoalSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.period_end < parsed.data.period_start) {
    return NextResponse.json({ error: "period_end is before period_start" }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_goals")
    .insert({
      space_id: parsed.data.space_id,
      title: parsed.data.title,
      target: parsed.data.target,
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      owner_id: parsed.data.owner_id ?? null,
      created_by: user!.id,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 500 });

  return NextResponse.json({ ...data, progress: 0 }, { status: 201 });
}
