import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireInternal } from "@/lib/auth-utils";

function getSupabase() {
  return createServerClient();
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();

  const { data: settings } = await supabase.from("settings").select("inactive_threshold_days").single();
  const threshold = settings?.inactive_threshold_days ?? 45;
  const cutoff = new Date(Date.now() - threshold * 86400000).toISOString();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, total_orders, last_order_date, rto_flag");

  let updated = 0;
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

  return NextResponse.json({ updated });
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
