import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();

  try {
    // 1. Find orders with 1970 dates or null delivered_at but 'delivered' status
    const { data: brokenOrders } = await supabase
      .from("orders")
      .select("id, created_at, order_number")
      .eq("delivery_status", "delivered")
      .or("delivered_at.lt.2020-01-01T00:00:00Z,delivered_at.is.null");

    if (!brokenOrders?.length) {
      return NextResponse.json({ message: "No corrupted orders found." });
    }

    let repaired = 0;
    for (const order of brokenOrders) {
      // Use created_at as a safe fallback for the delivery date
      const newDate = order.created_at;
      
      // Update order date
      await supabase.from("orders").update({ delivered_at: newDate }).eq("id", order.id);

      // Delete existing corrupted tasks for this order to allow regeneration
      await supabase.from("tasks").delete().eq("order_id", order.id);
      
      repaired++;
    }

    // 2. Trigger task generation logic (this can be a separate call or we just wait for the next cron)
    // For immediate effect, we'll tell the user to run the task generator
    
    return NextResponse.json({ 
      ok: true, 
      repaired, 
      message: `Repaired ${repaired} orders. Review tasks for ${repaired} customers (like Mukesh S) are now ready to be generated.` 
    });

  } catch (err: any) {
    console.error("Repair error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
