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
const BATCH_LIMIT = 150;

function getSupabase() {
  return createAdminClient();
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  // Ops/testing escape hatch: process exactly one order by id instead of
  // scanning the real backlog.
  const onlyOrderId = req.nextUrl.searchParams.get("orderId");

  // Find delivered orders AND orders with status "Delivered" (case-insensitive query via ilike or in)
  let orderQuery = supabase
    .from("orders")
    .select("id, customer_id, delivered_at, line_items, delivery_status")
    .in("delivery_status", ["delivered", "Delivered"])
    .not("delivered_at", "is", null);
  orderQuery = onlyOrderId ? orderQuery.eq("id", onlyOrderId) : orderQuery.limit(BATCH_LIMIT);

  const { data: orders, error: orderErr } = await orderQuery;

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });
  if (!orders?.length) return NextResponse.json({ generated: 0, checked: 0 });

  // Fetch global settings
  const settings = await getSystemSettings(supabase);

  let generated = 0;
  let skipped = 0;

  // Fetch product overrides once for the entire batch
  const { data: overrideData } = await supabase.from("product_overrides").select("*");

  for (const order of orders) {
    // 1. Double check: Does this order already have standard tasks?
    // We check for "review" specifically as a proxy for the standard set
    const { data: existing } = await supabase
      .from("tasks")
      .select("id")
      .eq("order_id", order.id)
      .in("task_type", ["review", "reorder", "final_followup"])
      .limit(1);

    if (existing?.length) {
      skipped++;
      continue;
    }

    // 2. Check Customer RTO Flag
    const { data: customer } = await supabase
      .from("customers")
      .select("rto_flag, segment")
      .eq("id", order.customer_id)
      .single();
    if (customer?.rto_flag) {
      skipped++;
      continue;
    }

    // 3. Resolve Offsets
    const lineItem = order.line_items?.[0];
    const override = overrideData?.find(o =>
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

  return NextResponse.json({
    generated,
    checked: orders.length,
    skipped
  });
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
