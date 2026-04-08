import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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
    .select("*, customer:customers(*), order:orders(*)")
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
    task_type: body.task_type,
    due_date: body.due_date,
    status: "pending",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
