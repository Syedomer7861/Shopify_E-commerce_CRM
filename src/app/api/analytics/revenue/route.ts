import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  try {
    // 1. Fetch all tasks with associated cart/order values
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select(`
        id, 
        task_type, 
        status, 
        assigned_to,
        abandoned_cart:abandoned_carts(total_price),
        order:orders(total_price),
        agent:profiles(name)
      `)
      .in("task_type", ["recovery", "ndr", "cod_verify"]);

    if (tasksError) throw tasksError;

    const stats = {
      recovery: { potential: 0, recovered: 0, count: 0, recoveredCount: 0 },
      ndr: { potential: 0, recovered: 0, count: 0, recoveredCount: 0 },
      cod: { potential: 0, recovered: 0, count: 0, recoveredCount: 0 },
      agents: {} as Record<string, { name: string, recovered: number, count: number }>
    };

    tasks?.forEach((t: any) => {
      const price = Number(t.abandoned_cart?.total_price || t.order?.total_price || 0);
      const isDone = t.status === "done";
      const agentId = t.assigned_to || "unassigned";
      const agentName = t.agent?.name || "Unassigned";

      if (!stats.agents[agentId]) {
        stats.agents[agentId] = { name: agentName, recovered: 0, count: 0 };
      }

      if (t.task_type === "recovery") {
        stats.recovery.count++;
        stats.recovery.potential += price;
        if (isDone) {
          stats.recovery.recovered += price;
          stats.recovery.recoveredCount++;
          stats.agents[agentId].recovered += price;
          stats.agents[agentId].count++;
        }
      } else if (t.task_type === "ndr") {
        stats.ndr.count++;
        stats.ndr.potential += price;
        if (isDone) {
          stats.ndr.recovered += price;
          stats.ndr.recoveredCount++;
          stats.agents[agentId].recovered += price;
          stats.agents[agentId].count++;
        }
      } else if (t.task_type === "cod_verify") {
        stats.cod.count++;
        stats.cod.potential += price;
        if (isDone) {
          stats.cod.recovered += price;
          stats.cod.recoveredCount++;
          stats.agents[agentId].recovered += price;
          stats.agents[agentId].count++;
        }
      }
    });

    return NextResponse.json({
      summary: {
        totalPotential: stats.recovery.potential + stats.ndr.potential + stats.cod.potential,
        totalRecovered: stats.recovery.recovered + stats.ndr.recovered + stats.cod.recovered,
        recoveryRate: stats.recovery.count > 0 ? (stats.recovery.recoveredCount / stats.recovery.count) * 100 : 0,
        ndrRate: stats.ndr.count > 0 ? (stats.ndr.recoveredCount / stats.ndr.count) * 100 : 0
      },
      breakdown: {
        recovery: stats.recovery,
        ndr: stats.ndr,
        cod: stats.cod
      },
      agentPerformance: Object.values(stats.agents).sort((a, b) => b.recovered - a.recovered)
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
