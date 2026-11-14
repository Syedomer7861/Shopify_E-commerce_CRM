import { createAdminClient } from "@/lib/supabase";
import { getSystemSettings, getShiprocketToken } from "@/lib/server-settings";
import { resolveUnmaskedPhone } from "@/lib/unmask-utils";
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrInternal } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
// Vercel Hobby caps functions at 60s; a higher value fails the deploy.
// On Pro this can go to 300. The syncs are incremental, so a cut-off run
// resumes on the next tick.
export const maxDuration = 60;

/**
 * Hourly Sentinel: Automatically heals masked records in the background.
 * Target: All customers with 'x', 'X', or '_SR_' in their phone.
 */
export async function GET(req: NextRequest) {
  const unauthorized = await requireOwnerOrInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
  const results = [];
  for (const org of orgs ?? []) {
    results.push({ orgId: org.id, ...(await sweepOrg(supabase, org.id)) });
  }
  return NextResponse.json({ success: true, orgs: results });
}

async function sweepOrg(supabase: any, orgId: string) {
  try {
    const settings = await getSystemSettings(supabase, orgId);
    const token = await getShiprocketToken(supabase, orgId);

    // 2. Find masked customers to heal
    const { data: customers } = await supabase
      .from("customers")
      .select("id, phone, name, email")
      .or('phone.ilike.%x%,phone.ilike.%_SR_%')
      .eq("org_id", orgId)
      .limit(50); // Safe batch size

    if (!customers || customers.length === 0) {
      return { message: "Sentinel: All records clean!" };
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
           token,
           orgId
        );

        if (phone && !phone.includes("x") && !phone.includes("X")) {
          // Deduplication Check
          const { data: existing } = await supabase
              .from("customers")
              .select("id")
              .eq("phone", phone)
              .eq("org_id", orgId)
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

    return {
      message: `Sentinel Sweep Complete: ${unmaskedCount} healed, ${mergedCount} merged.`
    };

  } catch (err: any) {
    return { error: err.message };
  }
}

// The scheduler posts to every job path; keep both verbs working.
export const POST = GET;
