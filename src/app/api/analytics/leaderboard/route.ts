import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  try {
    // 1. Fetch completed tasks with their associated orders and agent info
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select(`
        id,
        status,
        task_type,
        assigned_to,
        profiles!tasks_assigned_to_fkey (name, email),
        orders (total_price, delivery_status)
      `)
      .eq("status", "completed");

    if (error) throw error;

    const leaderboard: Record<string, { name: string, recoveredRevenue: number, tasksResolved: number }> = {};

    tasks.forEach((task: any) => {
      const agentId = task.assigned_to;
      if (!agentId) return;

      const agentName = task.profiles?.name || task.profiles?.email || "Unknown Agent";
      
      if (!leaderboard[agentId]) {
        leaderboard[agentId] = { name: agentName, recoveredRevenue: 0, tasksResolved: 0 };
      }

      leaderboard[agentId].tasksResolved++;
      
      // If the task was a recovery or transit update and the order is now delivered/pending, count its revenue
      // For simplicity, we count all revenue associated with completed recovery tasks
      if (task.task_type === "recovery" || task.task_type === "transit_update") {
        leaderboard[agentId].recoveredRevenue += parseFloat(task.orders?.total_price || 0);
      }
    });

    const result = Object.values(leaderboard).sort((a, b) => b.recoveredRevenue - a.recoveredRevenue);

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
