import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { WorkflowEngine } from "@/lib/workflow-engine";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { requirePrivileged } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  const unauthorized = await requirePrivileged(req, ["manage_automations"]);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  try {
    // 1. Identify "Stale" orders: in_transit for more than 2 days (48 hours)
    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - 2);

    const { data: staleOrders, error: stError } = await supabase
      .from("orders")
      .select("id, customer_id, total_price, order_number, customer:customers(segment, total_orders, rto_flag)")
      .eq("delivery_status", "in_transit")
      .lt("updated_at", staleThreshold.toISOString())
      .order("updated_at", { ascending: true })
      .limit(200); // work an oversized backlog down across runs, not in one fat read

    if (stError) throw stError;
    if (!staleOrders || staleOrders.length === 0) {
      return NextResponse.json({ processed: 0, message: "No stale shipments found" });
    }

    console.log(`🚛 Transit Escalator: Found ${staleOrders.length} stale shipments.`);

    let escalatedCount = 0;

    for (const order of staleOrders as any[]) {
      // 2. Check if a transit_update task already exists for this order
      const { data: existingTask } = await supabase
        .from("tasks")
        .select("id")
        .eq("order_id", order.id)
        .eq("task_type", "transit_update")
        .eq("status", "pending")
        .maybeSingle();

      if (!existingTask) {
        // 3. Create investigation task
        // Never called assignTaskOwner - confirmed live, this was a real
        // source of orphaned transit_update tasks with no owner.
        await supabase.from("tasks").insert({
          order_id: order.id,
          customer_id: order.customer_id,
          task_type: "transit_update",
          due_date: new Date().toISOString().split("T")[0],
          status: "pending",
          assigned_to: await assignTaskOwner(supabase, "transit_update", order.customer?.segment),
          priority_score: calculateTaskPriority({
            taskType: "transit_update",
            totalPrice: order.total_price || 0,
            totalOrders: order.customer?.total_orders || 0,
            rtoFlag: order.customer?.rto_flag || false
          }) + 20, // Extra priority for staleness
        });

        // 4. Trigger Workflow (Stale Shipment Inform message)
        await WorkflowEngine.trigger("stale_shipment", {
          order_id: order.id,
          customer_id: order.customer_id
        });

        escalatedCount++;
      }
    }

    return NextResponse.json({ triggered: escalatedCount });

  } catch (err: any) {
    console.error("❌ Transit Escalator Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
