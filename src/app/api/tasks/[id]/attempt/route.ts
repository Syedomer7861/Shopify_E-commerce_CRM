import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { WorkflowEngine } from "@/lib/workflow-engine";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createServerClient();

  try {
    const { outcome, note } = await req.json();
    const { id: taskId } = await params;

    // 1. Fetch current task state
    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .select("*, customer:customers(*)")
      .eq("id", taskId)
      .single();

    if (taskErr || !task) throw new Error("Task not found");

    const attempts = (task.call_attempt_count || 0) + 1;
    const isFailedCall = ["no_answer", "busy", "failed"].includes(outcome);
    const orderTotal = task.order?.total_price || 0;
    const isRepeat = task.customer?.segment === "repeat" || (task.customer?.total_orders || 0) > 1;

    // Smart Override: High Value (>2000) gets an extra attempt after 3 hours
    const maxAttempts = orderTotal >= 2000 ? 4 : 3;

    if (isFailedCall && attempts < maxAttempts) {
      // 2. Schedule next attempt
      // If it's the 3rd attempt on a high-value order, next is in 3 hours. Otherwise 20 mins.
      const delayMinutes = (orderTotal >= 2000 && attempts === 3) ? 180 : 20;
      const nextAttempt = new Date(Date.now() + delayMinutes * 60 * 1000);
      
      await supabase.from("tasks").update({
        call_attempt_count: attempts,
        next_attempt_at: nextAttempt.toISOString(),
        status: "pending"
      }).eq("id", taskId);

      // Log the attempt
      await supabase.from("call_logs").insert({
        task_id: taskId,
        customer_id: task.customer_id,
        outcome: outcome,
        note: `Attempt ${attempts}: ${note || outcome} (Next in ${delayMinutes}m)`,
        agent_name: "Internal API"
      });

      return NextResponse.json({ success: true, next_attempt: nextAttempt.toISOString() });
    } else if (isFailedCall && attempts >= maxAttempts) {
      // 3. Move to Final Follow-Up after limit reached
      // Smart Override: Repeat customers get a 24h delay before the final follow-up message/task
      let finalFollowUpDate = new Date();
      if (isRepeat) {
        finalFollowUpDate.setDate(finalFollowUpDate.getDate() + 1);
        console.log(`[TASKS] Repeat customer detected. Delaying Final Follow-Up for 24h.`);
      }

      await supabase.from("tasks").update({
        status: "done",
        call_attempt_count: attempts,
        completed_at: new Date().toISOString()
      }).eq("id", taskId);

      // Create a NEW Final Follow-Up task
      const { data: followUpTask } = await supabase.from("tasks").insert({
        customer_id: task.customer_id,
        order_id: task.order_id,
        task_type: "final_followup",
        due_date: finalFollowUpDate.toISOString().split("T")[0],
        status: "pending",
        assigned_to: task.assigned_to,
        priority_score: 30
      }).select("id").single();

      // Trigger Workflow (Only if NOT delayed, otherwise cron will handle it)
      if (!isRepeat) {
        await WorkflowEngine.trigger("final_followup" as any, { 
          customer_id: task.customer_id, 
          order_id: task.order_id 
        });
      }

      return NextResponse.json({ 
        success: true, 
        transitioned: "final_followup", 
        delayed: isRepeat, 
        due_date: finalFollowUpDate.toISOString() 
      });
    } else {
      // 4. Successful call: Mark as done
      await supabase.from("tasks").update({
        status: "done",
        call_attempt_count: attempts,
        completed_at: new Date().toISOString()
      }).eq("id", taskId);

      await supabase.from("call_logs").insert({
        task_id: taskId,
        customer_id: task.customer_id,
        outcome: outcome,
        note: note || "Customer answered re-order call",
        agent_name: "Internal API"
      });

      return NextResponse.json({ success: true, status: "completed" });
    }

  } catch (err: any) {
    console.error("❌ Task Attempt Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
