import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { requireInternal } from "@/lib/auth-utils";

function getSupabase() {
  return createServerClient();
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();

  // Find delivered orders AND orders with status "Delivered" (case-insensitive query via ilike or in)
  const { data: orders, error: orderErr } = await supabase
    .from("orders")
    .select("id, customer_id, delivered_at, line_items, delivery_status")
    .in("delivery_status", ["delivered", "Delivered"])
    .not("delivered_at", "is", null);

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });
  if (!orders?.length) return NextResponse.json({ generated: 0, checked: 0 });

  // Fetch global settings
  const settings = await getSystemSettings(supabase);

  let generated = 0;
  let skipped = 0;
  let issueTasks = 0;

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
      note: override?.usage_notes ? `COURSE NOTE: ${override.usage_notes}` : undefined,
      metadata: {
        course_duration: override?.course_duration_days || 30,
        upsell_logic: override?.upsell_product_name || null
      },
      status: "pending",
    }));

    const { error: insertErr } = await supabase.from("tasks").insert(newTasks);
    if (!insertErr) {
      generated += 3;
    } else {
      console.error(`Failed to insert tasks for order ${order.id}:`, insertErr);
    }
  }

  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - 7);
  const staleDate = staleCutoff.toISOString();

  const { data: issueOrders } = await supabase
    .from("orders")
    .select("id, customer_id, total_price, delivery_status, ordered_at")
    .in("delivery_status", ["rto", "failed", "in_transit"]);

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
  }

  // 5. [NEW] Win-back Task Generation (Dormant Customers)
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyDaysAgoStr = sixtyDaysAgo.toISOString();

  const { data: dormantCustomers } = await supabase
    .from("customers")
    .select("id, name, last_order_date, segment")
    .lt("last_order_date", sixtyDaysAgoStr)
    .not("last_order_date", "is", null);

  let winbackTasks = 0;
  for (const cust of dormantCustomers || []) {
     // Check if they already have an active win_back task
     const { count: existingWinback } = await supabase
       .from("tasks")
       .select("id", { count: "exact", head: true })
       .eq("customer_id", cust.id)
       .eq("task_type", "win_back")
       .not("status", "in", '("done","cancelled","skipped")');

     if ((existingWinback || 0) > 0) continue;

     // Assign to best available agent for re-engagement
     const assignedTo = await assignTaskOwner(supabase, "win_back", cust.segment);
     const { error: winErr } = await supabase.from("tasks").insert({
       customer_id: cust.id,
       assigned_to: assignedTo,
       task_type: "win_back",
       due_date: new Date().toISOString().split("T")[0],
       priority_score: 60,
       status: "pending"
     });
     
     if (!winErr) winbackTasks++;
  }

  return NextResponse.json({ 
    generated, 
    checked: orders.length, 
    skipped,
    issueTasks,
    winbackTasks
  });
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
