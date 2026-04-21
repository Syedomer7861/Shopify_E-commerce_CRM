import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// GET /api/customers
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const segment = searchParams.get("segment");
  const rto = searchParams.get("rto");
  const search = searchParams.get("search");

  let query = supabase.from("customers").select("*").order("created_at", { ascending: false });

  if (segment) query = query.eq("segment", segment);
  if (rto === "true") query = query.eq("rto_flag", true);
  if (search) {
    // Basic search on common fields
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,shopify_customer_id.ilike.%${search}%`);
    
    // 2. Check if search might be an Order ID
    const { data: orderCustomers } = await supabase.from("orders").select("customer_id").or(`order_number.ilike.%${search}%,shopify_order_id.ilike.%${search}%`);
    
    // 3. Check if search might be a Cart Token
    const { data: cartCustomers } = await supabase.from("abandoned_carts").select("customer_id").ilike("cart_token", `%${search}%`);

    const customerIds = [
      ...(orderCustomers || []).map(oc => oc.customer_id),
      ...(cartCustomers || []).map(cc => cc.customer_id)
    ].filter(Boolean);

    if (customerIds.length > 0) {
      query = query.or(`id.in.(${customerIds.map(id => `"${id}"`).join(",")}),name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/customers — create manual customer
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();

  if (!body.name || !body.phone) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "name and phone are required", status: 400 } }, { status: 400 });
  }

  const { data, error } = await supabase.from("customers").insert({
    name: body.name,
    phone: body.phone,
    email: body.email,
    notes: body.notes,
  }).select().single();

  if (error?.code === "23505") {
    return NextResponse.json({ error: { code: "DUPLICATE_PHONE", message: "Phone number already exists", status: 409 } }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
