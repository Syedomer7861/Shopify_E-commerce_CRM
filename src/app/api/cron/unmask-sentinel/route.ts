import { createServerClient } from "@/lib/supabase";
import { getSystemSettings, getShiprocketToken } from "@/lib/server-settings";
import { resolveUnmaskedPhone } from "@/lib/unmask-utils";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Max Allowed for Pro/Enterprise

/**
 * Hourly Sentinel: Automatically heals masked records in the background.
 * Target: All customers with 'x', 'X', or '_SR_' in their phone.
 */
export async function GET() {
  const supabase = createServerClient();

  try {
    // 1. Authorization (Optional: check for CRON header if on Vercel)
    // const authHeader = req.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return ...

    const settings = await getSystemSettings(supabase);
    const token = await getShiprocketToken(supabase);

    // 2. Find masked customers to heal
    const { data: customers } = await supabase
      .from("customers")
      .select("id, phone, name, email")
      .or('phone.ilike.%x%,phone.ilike.%_SR_%')
      .limit(50); // Safe batch size

    if (!customers || customers.length === 0) {
      return NextResponse.json({ success: true, message: "Sentinel: All records clean!" });
    }

    let unmaskedCount = 0;
    let mergedCount = 0;

    for (const cust of customers) {
      try {
        // Find latest order for this customer to get shopify_order_id
        const { data: order } = await supabase
          .from("orders")
          .select("shopify_order_id")
          .eq("customer_id", cust.id)
          .order("ordered_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // 🕵️ Attempt Shopify & Resolution Bypass
        let phone = await resolveUnmaskedPhone(
           supabase,
           cust.id,
           cust.email || null,
           order?.shopify_order_id || null,
           null,
           token
        );

        if (phone && !phone.includes("x") && !phone.includes("X")) {
          // Deduplication Check
          const { data: existing } = await supabase
              .from("customers")
              .select("id")
              .eq("phone", phone)
              .neq("id", cust.id)
              .maybeSingle();

          if (existing) {
              // Merge Logic
              await Promise.all([
                supabase.from("orders").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                supabase.from("tasks").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                supabase.from("abandoned_carts").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                supabase.from("call_logs").update({ customer_id: existing.id }).eq("customer_id", cust.id),
              ]);
              await supabase.from("customers").delete().eq("id", cust.id);
              mergedCount++;
          } else {
              // Standard Update
              await supabase.from("customers").update({ phone }).eq("id", cust.id);
          }
          unmaskedCount++;
        }
      } catch (e) {
        console.error(`Sentinel failed for ${cust.id}:`, e);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Sentinel Sweep Complete: ${unmaskedCount} healed, ${mergedCount} merged.` 
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
