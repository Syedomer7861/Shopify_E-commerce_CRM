import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// PATCH /api/tasks/[id]/complete
export async function PATCH(req: NextRequest, { params }: { params: { id: string; action: string } }) {
  const supabase = getSupabase();
  const body = await req.json();
  const { id } = params;
  const action = req.nextUrl.pathname.split("/").pop(); // complete | reschedule | skip

  if (action === "complete") {
    const now = new Date().toISOString();

    const { data: task } = await supabase.from("tasks").select("customer_id").eq("id", id).single();
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    // Update task
    await supabase.from("tasks").update({ status: "done", completed_at: now }).eq("id", id);

    // Insert call log
    await supabase.from("call_logs").insert({
      task_id: id,
      customer_id: task.customer_id,
      outcome: body.outcome ?? "done",
      note: body.note ?? null,
      agent_name: body.agent_name ?? null,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "reschedule") {
    if (!body.new_date) return NextResponse.json({ error: "new_date required" }, { status: 400 });

    const { data: task } = await supabase.from("tasks").select("customer_id").eq("id", id).single();
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    await supabase.from("tasks").update({ status: "rescheduled", rescheduled_to: body.new_date }).eq("id", id);

    await supabase.from("call_logs").insert({
      task_id: id,
      customer_id: task.customer_id,
      outcome: "rescheduled",
      note: body.reason ?? null,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "skip") {
    await supabase.from("tasks").update({ status: "skipped" }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
