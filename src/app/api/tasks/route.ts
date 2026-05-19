import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";

function getSupabase() {
  return createServerClient();
}

// GET /api/tasks — list with filters
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const customer_id = searchParams.get("customer_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  let query = supabase
    .from("tasks")
    .select(`
      id, status, due_date, task_type, customer_id, order_id, assigned_to, priority_score, created_at,
      customer:customers(id, name, phone, email, segment, rto_flag, address, city, state, zip),
      order:orders(id, order_number, shopify_order_id, total_price, line_items, delivered_at, fulfillment_status, delivery_status),
      abandoned_cart:abandoned_carts(id, cart_token, total_price, line_items, abandoned_at)
    `)
    .order("due_date", { ascending: true });

  if (status) query = query.eq("status", status);
  if (type) query = query.eq("task_type", type);
  if (customer_id) query = query.eq("customer_id", customer_id);
  if (dateFrom) query = query.gte("due_date", dateFrom);
  if (dateTo) query = query.lte("due_date", dateTo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/tasks — manually create task
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();

  const { data, error } = await supabase.from("tasks").insert({
    order_id: body.order_id,
    customer_id: body.customer_id,
    assigned_to: body.assigned_to || await assignTaskOwner(supabase, body.task_type),
    task_type: body.task_type,
    due_date: body.due_date,
    priority_score: calculateTaskPriority({
      taskType: body.task_type,
      totalPrice: body.total_price || 0,
      totalOrders: body.total_orders || 0,
      rtoFlag: body.rto_flag || false,
    }),
    status: "pending",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
