import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireOwnerOrInternal } from "@/lib/auth-utils";

function getSupabase() {
  return createAdminClient();
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireOwnerOrInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();

  // Per-org threshold and customer set - .single() on `settings` would
  // outright error once a 2nd org's row exists (it requires exactly one
  // row), and an unfiltered `customers` scan would mix every tenant's
  // segments together.
  const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);

  let updated = 0;
  for (const org of orgs ?? []) {
    const { data: settings } = await supabase.from("settings").select("inactive_threshold_days").eq("org_id", org.id).maybeSingle();
    const threshold = settings?.inactive_threshold_days ?? 45;
    const cutoff = new Date(Date.now() - threshold * 86400000).toISOString();

    const { data: customers } = await supabase
      .from("customers")
      .select("id, total_orders, last_order_date, rto_flag")
      .eq("org_id", org.id);

    for (const c of customers ?? []) {
      let segment: string;
      if (c.rto_flag) {
        segment = "risky";
      } else if (c.total_orders >= 2) {
        segment = "repeat";
      } else if (!c.last_order_date || c.last_order_date < cutoff) {
        segment = "inactive";
      } else {
        segment = "one_time";
      }

      await supabase.from("customers").update({ segment }).eq("id", c.id);
      updated++;
    }
  }

  return NextResponse.json({ updated });
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
