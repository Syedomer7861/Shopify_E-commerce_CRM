import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { requireInternal } from "@/lib/auth-utils";

// Split out of /api/cron/task-generator - see the comment at the top of
// that route for why. Creates an issue_resolution task for RTO/failed
// orders, or ones stuck in_transit 7+ days.
export const maxDuration = 60;
const BATCH_LIMIT = 50;

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  // Ops/testing escape hatch: process exactly one order by id instead of
  // scanning the real backlog. Org-agnostic - the order itself pins the org.
  const onlyOrderId = req.nextUrl.searchParams.get("orderId");

  if (onlyOrderId) {
    // Matches orders_needing_issue_task's own condition (rto/failed only
    // for now) rather than re-deriving it separately, so the test path
    // can't drift from the real one.
    const { data, error } = await supabase
      .from("orders")
      .select("id, customer_id, org_id, total_price, delivery_status, ordered_at")
      .eq("id", onlyOrderId)
      .in("delivery_status", ["rto", "failed"]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) return NextResponse.json({ issueTasks: 0, scanned: 0 });
    const result = await processIssueOrders(supabase, data[0].org_id, data);
    return NextResponse.json(result);
  }

  const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
  let issueTasks = 0, scanned = 0;
  for (const org of orgs ?? []) {
    // orders_needing_issue_task (migrations/20260827e_task_backlog_rpcs.sql,
    // org-scoped in 20261106a) already excludes orders that have the task
    // and orders by id - a plain .limit(N) with no ordering and no
    // exclusion filter was confirmed live to make zero real progress
    // across repeated calls (Postgres has no obligation to return
    // different rows), and the in_transit branch is disabled there for
    // now - see that migration's comment for why.
    const { data, error } = await supabase.rpc("orders_needing_issue_task", { limit_n: BATCH_LIMIT, target_org_id: org.id });
    if (error) { console.error(`issue-task-generator RPC failed for org ${org.id}:`, error.message); continue; }
    if (!data?.length) continue;
    const result = await processIssueOrders(supabase, org.id, data);
    issueTasks += result.issueTasks;
    scanned += result.scanned;
  }
  return NextResponse.json({ issueTasks, scanned });
}

async function processIssueOrders(supabase: any, orgId: string, issueOrders: any[]) {
  let issueTasks = 0;

  for (const order of issueOrders || []) {
    const { data: customer } = await supabase
      .from("customers")
      .select("total_orders, rto_flag, segment")
      .eq("id", order.customer_id)
      .maybeSingle();

    const assignedTo = await assignTaskOwner(supabase, "issue_resolution", customer?.segment);
    const dueDate = new Date().toISOString().split("T")[0];

    // unique_order_task is UNIQUE(order_id, task_type) with no status
    // qualifier - permanent, not "one active at a time". An order whose
    // PRIOR issue_resolution task is already resolved (done/cancelled/
    // skipped - which is exactly what orders_needing_issue_task's own
    // exclusion condition allows through) can never get a new row via a
    // plain insert; confirmed live, every single one of them failed with
    // "duplicate key value violates unique constraint unique_order_task".
    // cod_verify/vip_followup avoid this because they already upsert on
    // this same constraint - matching that pattern here instead.
    const { error: issueErr } = await supabase.from("tasks").upsert({
      org_id: orgId,
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
    }, { onConflict: "order_id, task_type" });

    if (!issueErr) issueTasks++;
    else console.error(`issue_resolution task insert failed for order ${order.id}:`, issueErr.message);
  }

  return { issueTasks, scanned: issueOrders?.length || 0 };
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
