import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority, insertTasksIgnoringDuplicates } from "@/lib/task-engine";
import { requireInternal } from "@/lib/auth-utils";

// Vercel Hobby caps functions at 60s; a higher value fails the deploy.
// On Pro this can go to 300. The syncs are incremental, so a cut-off run
// resumes on the next tick.
//
// This route used to also generate issue_resolution tasks (RTO/failed/
// stale-in-transit orders) and win_back tasks (dormant customers) in the
// same invocation, after this order loop. Confirmed live: win_back had
// ZERO rows ever despite 1,224 real dormant customers qualifying, and
// review/reorder/final_followup (this loop's own output) hadn't produced
// anything new in 2 days despite 1,132 real delivered orders to process -
// each order here costs several sequential DB round-trips
// (existing-check, customer fetch, assignTaskOwner's own 2+ queries,
// insert), so the combined three-phase workload was easily 10,000+
// sequential round-trips against a single 60s budget. The order loop
// alone was starving the later phases of any execution time, probably
// every single day. Split into three routes - see
// /api/cron/issue-task-generator and /api/cron/winback-generator - so
// each phase gets its own full 60s budget instead of sharing one.
export const maxDuration = 60;

// Caps how many orders one invocation processes, so a single run can
// never itself exceed the 60s budget even on a large backlog - the
// existing-task skip check above already makes this safely incremental
// across daily runs (see the comment on that block).
const BATCH_LIMIT = 50;

function getSupabase() {
  return createAdminClient();
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  // Ops/testing escape hatch: process exactly one order by id instead of
  // scanning the real backlog. Org-agnostic - the order itself pins the org.
  const onlyOrderId = req.nextUrl.searchParams.get("orderId");

  if (onlyOrderId) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, customer_id, org_id, delivered_at, line_items, delivery_status, customer:customers(rto_flag, segment)")
      .eq("id", onlyOrderId)
      .in("delivery_status", ["delivered", "Delivered"])
      .not("delivered_at", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const orders = (data || []).map((o: any) => ({ ...o, rto_flag: o.customer?.rto_flag, segment: o.customer?.segment }));
    if (!orders.length) return NextResponse.json({ generated: 0, checked: 0 });
    const result = await processOrders(supabase, orders[0].org_id, orders);
    return NextResponse.json(result);
  }

  const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
  let generated = 0, checked = 0, skipped = 0;
  for (const org of orgs ?? []) {
    // orders_needing_review_tasks (migrations/20260827e_task_backlog_rpcs.sql,
    // org-scoped in 20261106a) already excludes orders that have the
    // tasks, RTO-flagged customers, and orders by id - a plain .limit(N)
    // with no ordering and no exclusion filter was confirmed live (on the
    // sibling issue-task-generator route) to make zero real progress
    // across repeated calls.
    const { data, error } = await supabase.rpc("orders_needing_review_tasks", { limit_n: BATCH_LIMIT, target_org_id: org.id });
    if (error) { console.error(`task-generator RPC failed for org ${org.id}:`, error.message); continue; }
    if (!data?.length) continue;
    const result = await processOrders(supabase, org.id, data);
    generated += result.generated;
    checked += result.checked;
    skipped += result.skipped;
  }
  return NextResponse.json({ generated, checked, skipped });
}

async function processOrders(supabase: any, orgId: string, orders: any[]) {
  // Fetch this org's settings
  const settings = await getSystemSettings(supabase, orgId);

  let generated = 0;
  let skipped = 0;

  // Fetch product overrides once for the entire batch
  const { data: overrideData } = await supabase.from("product_overrides").select("*").eq("org_id", orgId);

  for (const order of orders) {
    const customer = { rto_flag: order.rto_flag, segment: order.segment };

    // 3. Resolve Offsets
    const lineItem = order.line_items?.[0];
    const override = overrideData?.find((o: any) =>
      o.shopify_product_id === String(lineItem?.product_id) ||
      o.shopify_product_id === String(lineItem?.id) ||
      o.shopify_product_id === lineItem?.title ||
      o.product_name === lineItem?.title
    );

    const deliveredDate = new Date(order.delivered_at);
    if (isNaN(deliveredDate.getTime()) || deliveredDate.getFullYear() < 2020) {
      skipped++;
      continue;
    }

    const addDays = (d: Date, n: number) => {
      const r = new Date(d);
      r.setDate(r.getDate() + n);
      return r.toISOString().split("T")[0];
    };

    const taskTemplates = [
      { task_type: "review",         offset: override?.review_offset_days   ?? settings?.review_offset_days   ?? 5 },
      { task_type: "reorder",        offset: override?.reorder_offset_days  ?? settings?.reorder_offset_days  ?? 20 },
      { task_type: "final_followup", offset: override?.final_offset_days    ?? settings?.final_offset_days    ?? 30 },
    ];

    const assignedTo = await assignTaskOwner(supabase, "review", customer?.segment);
    const newTasks = taskTemplates.map(t => ({
      org_id: orgId,
      order_id: order.id,
      customer_id: order.customer_id,
      assigned_to: assignedTo,
      task_type: t.task_type,
      due_date: addDays(deliveredDate, t.offset),
      priority_score: calculateTaskPriority({
        taskType: t.task_type as any,
        dueDate: addDays(deliveredDate, t.offset),
        totalOrders: customer?.rto_flag ? 0 : undefined,
        isPriorityOverride: override?.is_priority || false,
      }),
      // tasks has no "note" column (only manager_note, a different concept -
      // manager review comments, not product usage instructions). That key
      // was set explicitly (even to undefined), so Object.keys() always
      // included it and every insert here was rejected outright by
      // PostgREST with "Could not find the 'note' column" - confirmed live.
      // Folding it into metadata (a real jsonb column already used for
      // course_duration/upsell_logic below) instead of dropping the data.
      metadata: {
        course_duration: override?.course_duration_days || 30,
        upsell_logic: override?.upsell_product_name || null,
        usage_notes: override?.usage_notes ? `COURSE NOTE: ${override.usage_notes}` : null
      },
      status: "pending",
    }));

    const { error: insertErr } = await insertTasksIgnoringDuplicates(supabase, newTasks);
    if (!insertErr) {
      generated += 3;
    } else {
      console.error(`Failed to insert tasks for order ${order.id}:`, insertErr);
    }
  }

  return {
    generated,
    checked: orders.length,
    skipped
  };
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
