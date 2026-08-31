import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";
import { notifyUser } from "@/lib/notifications-server";

const PatchIntakeSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
  list_id: z.string().uuid().optional(), // where to drop the task on accept
});

type Ctx = { params: { id: string } };

// PATCH /api/marketing/intake/:id — accept (spawns a task) or reject
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase, user } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PatchIntakeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: intake, error: intakeErr } = await supabase!
    .from("mkt_intake_requests")
    .select("*")
    .eq("id", params.id)
    .single();
  if (intakeErr || !intake) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (intake.status !== "new") {
    return NextResponse.json({ error: `Already ${intake.status}` }, { status: 409 });
  }

  let createdTaskId: string | null = null;

  if (parsed.data.status === "accepted") {
    // Target list: caller's choice, else the seeded "Requests Inbox", else the first list.
    let listId = parsed.data.list_id ?? null;
    if (!listId) {
      const { data: inbox } = await supabase!
        .from("mkt_lists")
        .select("id")
        .eq("archived", false)
        .ilike("name", "%request%")
        .limit(1)
        .maybeSingle();
      listId = inbox?.id ?? null;
    }
    if (!listId) {
      const { data: any1 } = await supabase!
        .from("mkt_lists")
        .select("id")
        .eq("archived", false)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      listId = any1?.id ?? null;
    }
    if (!listId) return NextResponse.json({ error: "No list to add the task to — create one first" }, { status: 400 });

    const { data: list } = await supabase!.from("mkt_lists").select("statuses").eq("id", listId).single();
    const firstStatus = (list?.statuses as Array<{ id: string }> | undefined)?.[0]?.id ?? "backlog";

    const { data: last } = await supabase!
      .from("mkt_tasks")
      .select("position")
      .eq("list_id", listId)
      .eq("status", firstStatus)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: task, error: taskErr } = await supabase!
      .from("mkt_tasks")
      .insert({
        list_id: listId,
        title: intake.title,
        description: intake.details ?? null,
        status: firstStatus,
        due_date: intake.desired_date ?? null,
        source_ref: { intake_request_id: intake.id, ...(intake.ref ?? {}) },
        position: (last?.position ?? 0) + 1000,
        created_by: user!.id,
      })
      .select("id")
      .single();
    if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });
    createdTaskId = task.id;
  }

  const { data: updated, error: updErr } = await supabase!
    .from("mkt_intake_requests")
    .update({ status: parsed.data.status, created_task_id: createdTaskId })
    .eq("id", params.id)
    .select("*")
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Tell the requester what happened.
  try {
    await notifyUser(
      intake.requester_id,
      `Creative request ${parsed.data.status}`,
      intake.title.slice(0, 140),
      createdTaskId ? `/marketing?task=${createdTaskId}` : "/marketing",
      parsed.data.status === "accepted" ? "success" : "warning"
    );
  } catch {
    /* non-critical */
  }

  return NextResponse.json(updated);
}
