import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { WorkflowEngine } from "@/lib/workflow-engine";
import { calculateTaskPriority } from "@/lib/task-engine";
import { requireInternal } from "@/lib/auth-utils";

/**
 * Transit Inform Cron
 * Proactively flags shipments stuck in transit for 48+ hours.
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  try {
    // 1. Identify "Stale" orders: in_transit for more than 48 hours
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - 48);

    const { data: staleOrders, error: stError } = await supabase
      .from("orders")
      .select("*, customer:customers(*)")
      .eq("delivery_status", "in_transit")
      .lt("updated_at", staleThreshold.toISOString());

    if (stError) throw stError;
    if (!staleOrders || staleOrders.length === 0) {
      return NextResponse.json({ processed: 0, message: "No stale shipments identified" });
    }

    console.log(`🚛 Transit Inform: Found ${staleOrders.length} stale shipments.`);

    let triggeredCount = 0;

    for (const order of staleOrders) {
      // 2. Check for existing pending transit or issue tasks to avoid noise
      const { data: existingTask } = await supabase
        .from("tasks")
        .select("id")
        .eq("order_id", order.id)
        .in("task_type", ["transit_update", "issue_resolution"])
        .eq("status", "pending")
        .maybeSingle();

      if (!existingTask) {
        // 3. Create investigation task
        const { error: taskErr } = await supabase.from("tasks").insert({
          order_id: order.id,
          customer_id: order.customer_id,
          task_type: "transit_update",
          due_date: new Date().toISOString().split("T")[0],
          status: "pending",
          priority_score: calculateTaskPriority({
            taskType: "transit_update",
            totalPrice: order.total_price || 0,
            totalOrders: order.customer?.total_orders || 0,
            rtoFlag: order.customer?.rto_flag || false
          }) + 25, // Staleness penalty/bonus
        });

        if (taskErr) {
          console.error(`❌ Failed to create task for order ${order.order_number}:`, taskErr.message);
          continue;
        }

        // 4. Trigger Workflow (Stale Shipment Inform message)
        // This can send a proactive "Your order is on the way, slightly delayed" message
        await WorkflowEngine.trigger("stale_shipment", {
          order_id: order.id,
          customer_id: order.customer_id
        });

        triggeredCount++;
      }
    }

    // 5. Log activity
    await supabase.from("webhook_logs").insert({
      source: "cron",
      topic: "transit_inform",
      status: "processed",
      payload: { processed: staleOrders.length, triggered: triggeredCount }
    });

    return NextResponse.json({ success: true, processed: staleOrders.length, triggered: triggeredCount });

  } catch (err: any) {
    console.error("❌ Transit Inform Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
