import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { getServiceSupabase } from "@/lib/supabase";
import { refreshProductCatalog } from "@/lib/product-catalog";

// Rides the existing daily cron trigger (see .github/workflows/cron.yml) and
// self-gates to ~3 times a month, the same pattern analytics-digest already
// uses to ride daily for a weekly cadence. Pass ?force=true to run on demand
// (e.g. an admin manually triggering a re-sync via curl).
const SCHEDULED_DAYS = [1, 11, 21];

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const force = req.nextUrl.searchParams.get("force") === "true";
  const dayOfMonth = new Date().getDate();
  if (!force && !SCHEDULED_DAYS.includes(dayOfMonth)) {
    return NextResponse.json({ skipped: true, reason: `not a scheduled day (runs on ${SCHEDULED_DAYS.join("/")} of the month)` });
  }

  const supabase = getServiceSupabase(req);
  try {
    const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
    const results = [];
    for (const org of orgs ?? []) {
      try {
        results.push({ orgId: org.id, ...(await refreshProductCatalog(supabase, org.id)) });
      } catch (orgErr: any) {
        results.push({ orgId: org.id, error: orgErr.message });
      }
    }
    return NextResponse.json({ ok: true, orgs: results });
  } catch (e: any) {
    console.error("refresh-product-catalog error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
