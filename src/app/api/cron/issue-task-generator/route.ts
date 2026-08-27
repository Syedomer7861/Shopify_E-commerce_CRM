import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { requireInternal } from "@/lib/auth-utils";

// Split out of /api/cron/task-generator - see the comment at the top of
// that route for why. Creates an issue_resolution task for RTO/failed
// orders, or ones stuck in_transit 7+ days.
export const maxDuration = 60;
const BATCH_LIMIT = 150;

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  // Ops/testing escape hatch: process exactly one order by id instead of
  // scanning the real backlog.
  const onlyOrderId = req.nextUrl.searchParams.get("orderId");

  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - 7);
  const staleDate = staleCutoff.toISOString();

  let issueQuery = supabase
    .from("orders")
    .select("id, customer_id, total_price, delivery_status, ordered_at")
    .in("delivery_status", ["rto", "failed", "in_transit"]);
  issueQuery = onlyOrderId ? issueQuery.eq("id", onlyOrderId) : issueQuery.limit(BATCH_LIMIT);

  const { data: issueOrders, error } = await issueQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let issueTasks = 0;

  for (const order of issueOrders || []) {
    const requiresIssueTask =
      order.delivery_status === "rto" ||
      order.delivery_status === "failed" ||
      (order.delivery_status === "in_transit" && order.ordered_at <= staleDate);

    if (!requiresIssueTask) continue;

    const { count: existingIssue } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)
      .eq("task_type", "issue_resolution")
      .not("status", "in", '("done","cancelled","skipped")');

    if ((existingIssue || 0) > 0) continue;

    const { data: customer } = await supabase
      .from("customers")
      .select("total_orders, rto_flag, segment")
      .eq("id", order.customer_id)
      .maybeSingle();

    const assignedTo = await assignTaskOwner(supabase, "issue_resolution", customer?.segment);
    const dueDate = new Date().toISOString().split("T")[0];

    const { error: issueErr } = await supabase.from("tasks").insert({
      order_id: order.id,
      customer_id: order.customer_id,
      assigned_to: assignedTo,
      task_type: "issue_resolution",
      due_date: dueDate,
      priority_score: calculateTaskPriority({
        taskType: "issue_resolution",
        totalPrice: Number(order.total_price) || 0,
        totalOrders: customer?.total_orders || 0,
        rtoFlag: customer?.rto_flag || order.delivery_status === "rto",
      }),
      status: "pending",
    });

    if (!issueErr) issueTasks++;
    else console.error(`issue_resolution task insert failed for order ${order.id}:`, issueErr.message);
  }

  return NextResponse.json({ issueTasks, scanned: issueOrders?.length || 0 });
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
