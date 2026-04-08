import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
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
  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let generated = 0;
  let skipped = 0;

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
      .select("rto_flag")
      .eq("id", order.customer_id)
      .single();
    if (customer?.rto_flag) {
      skipped++;
      continue;
    }

    // 3. Resolve Offsets
    const productId = order.line_items?.[0]?.product_id;
    let override: any = null;
    if (productId) {
      const { data: ov } = await supabase.from("product_overrides")
        .select("*").eq("shopify_product_id", productId).single();
      override = ov;
    }

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

    const newTasks = taskTemplates.map(t => ({
      order_id: order.id,
      customer_id: order.customer_id,
      task_type: t.task_type,
      due_date: addDays(deliveredDate, t.offset),
      status: "pending",
    }));

    const { error: insertErr } = await supabase.from("tasks").insert(newTasks);
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
