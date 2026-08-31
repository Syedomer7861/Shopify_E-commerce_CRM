import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

const CreateEntrySchema = z.object({
  minutes: z.number().int().positive().max(1440),
  note: z.string().max(2000).optional(),
  spent_on: z.string().date().optional(),
});

type Ctx = { params: { id: string } };

// GET /api/marketing/tasks/:id/time — entries for a task, newest first
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase!
    .from("mkt_time_entries")
    .select("*, user:profiles(id, name, email)")
    .eq("task_id", params.id)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/marketing/tasks/:id/time — log time against the task
export async function POST(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase, user } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateEntrySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_time_entries")
    .insert({
      task_id: params.id,
      user_id: user!.id,
      minutes: parsed.data.minutes,
      note: parsed.data.note ?? null,
      ...(parsed.data.spent_on ? { spent_on: parsed.data.spent_on } : {}),
    })
    .select("*, user:profiles(id, name, email)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
