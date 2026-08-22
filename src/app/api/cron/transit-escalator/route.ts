import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { WorkflowEngine } from "@/lib/workflow-engine";
import { calculateTaskPriority } from "@/lib/task-engine";
import { requireInternal } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  try {
    // 1. Identify "Stale" orders: in_transit for more than 2 days (48 hours)
    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - 2);

    const { data: staleOrders, error: stError } = await supabase
      .from("orders")
      .select("*, customer:customers(*)")
      .eq("delivery_status", "in_transit")
      .lt("updated_at", staleThreshold.toISOString());

    if (stError) throw stError;
    if (!staleOrders || staleOrders.length === 0) {
      return NextResponse.json({ processed: 0, message: "No stale shipments found" });
    }

    console.log(`🚛 Transit Escalator: Found ${staleOrders.length} stale shipments.`);

    let escalatedCount = 0;

    for (const order of staleOrders) {
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
        await supabase.from("tasks").insert({
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
