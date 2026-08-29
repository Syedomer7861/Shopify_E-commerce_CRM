import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

function getSupabase() {
  return createServerClient();
}

// PATCH /api/tasks/[id]/[action]
export async function PATCH(req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  const body = await req.json();
  const { id, action } = await params; // ✅ await params (Next.js 15)

  if (action === "complete") {
    const now = new Date().toISOString();

    const { data: task } = await supabase
      .from("tasks")
      .select("customer_id, order_id, abandoned_cart_id, task_type, priority_score, assigned_to, customers(name)")
      .eq("id", id)
      .single();
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const isAutoReschedule = body.outcome === "rescheduled" || body.outcome === "no_answer";
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().split('T')[0];

    const updateData: any = isAutoReschedule
      ? { status: "rescheduled", due_date: tomorrow, rescheduled_to: tomorrow }
      : { status: "done", completed_at: now };

    await supabase.from("tasks").update(updateData).eq("id", id);

    // Real per-order revenue attribution - see src/lib/revenue-attribution.ts.
    // Only fires on a genuine completion (not an auto-reschedule), and only
    // for task types that plausibly drove the order; the function itself
    // guarantees at most one credit per order regardless of how many
    // tasks get closed against it.
    if (!isAutoReschedule) {
      const { attributeOrderRevenue } = await import("@/lib/revenue-attribution");
      await attributeOrderRevenue(supabase, {
        orderId: task.order_id,
        agentId: (task as any).assigned_to,
        taskId: id,
        taskType: (task as any).task_type,
        customerId: task.customer_id,
        abandonedCartId: task.abandoned_cart_id,
      });
    }

    await supabase.from("call_logs").insert({
      task_id: id,
      customer_id: task.customer_id,
      outcome: body.outcome ?? "done",
      note: body.note ?? null,
      agent_name: body.agent_name ?? null,
    });

    // 2. Log to Audit System
    const { triggerAuditTask } = await import("@/lib/task-engine");
    await triggerAuditTask(supabase, { 
      ...task, 
      id, 
      outcome: body.outcome,
      agent_email: body.agent_email // Pass email for the audit task note
    });

    // 3. Live Sync to Google Sheets (Comprehensive)
    try {
      const { appendToSheet } = await import("@/lib/google-sheets");
      await appendToSheet("Task_Resolutions", {
        task_id: id,
        task_type: (task as any).task_type || "manual",
        customer: (task as any).customers?.name || "Unknown",
        action: "complete",
        outcome: body.outcome || "done",
        note: body.note || "",
        agent: body.agent_email || "System",
        timestamp: now
      });
    } catch (err) {
      console.error("Sync to Sheets failed in API:", err);
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "reschedule") {
    if (!body.new_date) return NextResponse.json({ error: "new_date required" }, { status: 400 });

    const { data: task } = await supabase
      .from("tasks")
      .select("customer_id, task_type, customers(name)")
      .eq("id", id)
      .single();
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    await supabase.from("tasks").update({ status: "rescheduled", rescheduled_to: body.new_date }).eq("id", id);

    await supabase.from("call_logs").insert({
      task_id: id,
      customer_id: task.customer_id,
      outcome: "rescheduled",
      note: body.reason ?? null,
    });

    // Live Sync to Google Sheets (In-Depth)
    import("@/lib/google-sheets").then(m => {
      m.appendToSheet("Task_Resolutions", {
        task_id: id,
        task_type: (task as any).task_type || "manual",
        customer: (task as any).customers?.name || "Unknown",
        action: "reschedule",
        outcome: "rescheduled",
        note: body.reason || "",
        agent: "Manual",
        timestamp: new Date().toISOString()
      });
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "skip") {
    // Fetch details for skip too
    const { data: task } = await supabase
      .from("tasks")
      .select("customer_id, task_type, customers(name)")
      .eq("id", id)
      .single();

    await supabase.from("tasks").update({ status: "skipped" }).eq("id", id);

    // Live Sync to Google Sheets (In-Depth)
    import("@/lib/google-sheets").then(m => {
      m.appendToSheet("Task_Resolutions", {
        task_id: id,
        task_type: (task as any)?.task_type || "manual",
        customer: (task as any)?.customers?.name || "Unknown",
        action: "skip",
        outcome: "skipped",
        agent: "Manual",
        timestamp: new Date().toISOString()
      });
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}