import { orQuote } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign"), to: z.string().uuid() }),
  z.object({ type: z.literal("set_priority"), priority: z.enum(["urgent", "high", "normal", "low"]) }),
  z.object({ type: z.literal("notify"), to: z.string().uuid().optional() }),
  z.object({ type: z.literal("add_subtask"), title: z.string().min(1).max(300) }),
  z.object({ type: z.literal("move_to_list"), list_id: z.string().uuid() }),
  z.object({ type: z.literal("set_field"), field: z.string().min(1).max(60), value: z.any() }),
  z.object({ type: z.literal("set_due_date"), days: z.number().int().min(-365).max(365) }),
  z.object({ type: z.literal("run_campaign"), segment: z.string().min(1).max(60), name: z.string().max(160).optional() }),
]);

const CreateAutomationSchema = z.object({
  name: z.string().min(1).max(160),
  list_id: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  trigger: z.object({
    event: z.enum(["status_changed", "task_created"]),
    to: z.string().min(1).max(60).optional(),
  }),
  actions: z.array(ActionSchema).min(1),
});

// GET /api/marketing/automations
export async function GET(req: NextRequest) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const listId = new URL(req.url).searchParams.get("list_id");
  let query = supabase!.from("mkt_automations").select("*").order("created_at", { ascending: false });
  if (listId) query = query.or(`list_id.is.null,list_id.eq.${orQuote(listId)}`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/marketing/automations
export async function POST(req: NextRequest) {
  const { errorResponse, supabase, user } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateAutomationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_automations")
    .insert({
      name: parsed.data.name,
      list_id: parsed.data.list_id ?? null,
      enabled: parsed.data.enabled ?? true,
      trigger: parsed.data.trigger,
      actions: parsed.data.actions,
      created_by: user!.id,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
