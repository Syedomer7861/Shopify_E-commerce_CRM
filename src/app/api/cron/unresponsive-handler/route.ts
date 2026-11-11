import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePrivileged } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  const unauthorized = await requirePrivileged(req, ["manage_automations"]);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  try {
    // 1. Identify tasks in 'final_followup' status older than 24h
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - 24);

    const { data: staleTasks, error: stError } = await supabase
      .from("tasks")
      .select("id, created_at, order_id, customer:customers(last_wa_inbound_at)")
      .eq("task_type", "final_followup")
      .eq("status", "pending")
      .lt("created_at", staleThreshold.toISOString())
      .order("created_at", { ascending: true })
      .limit(200); // cap the per-run read; the rest resume next run

    if (stError) throw stError;
    if (!staleTasks || staleTasks.length === 0) {
      return NextResponse.json({ processed: 0, message: "No stale follow-up tasks found" });
    }

    console.log(`🧹 Unresponsive Handler: Processing ${staleTasks.length} tasks.`);

    let closedCount = 0;

    for (const task of staleTasks as any[]) {
      // 2. Check for inbound activity since task creation
      const lastInbound = task.customer?.last_wa_inbound_at;
      const taskCreated = new Date(task.created_at);

      if (!lastInbound || new Date(lastInbound) < taskCreated) {
        // Customer has NOT replied since we sent the final follow-up
        
        // Mark as Unresponsive
        await supabase.from("tasks").update({
          status: "skipped", // Or a new 'unresponsive' status if we add it
          completed_at: new Date().toISOString()
        }).eq("id", task.id);

        // Update the order if linked
        if (task.order_id) {
          await supabase.from("orders").update({
             delivery_status: "failed" // Consider "cancelled" or "failed"
          }).eq("id", task.order_id);
        }

        closedCount++;
      }
    }

    return NextResponse.json({ processed: closedCount, total: staleTasks.length });

  } catch (err: any) {
    console.error("❌ Unresponsive Handler Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
