import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireInternal } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// Rebuilds the trailing window of rollup_daily_orders. Runs nightly (GitHub
// Actions daily group). A trailing window - not just yesterday - so late
// webhook updates that flip an old order's delivery_status get picked up.
export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const days = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("days") || 3)));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  try {
    const { data, error } = await supabase.rpc("rebuild_rollup_orders", { since });
    if (error) throw error;
    return NextResponse.json({ ok: true, table: "rollup_daily_orders", since, rowsUpserted: data ?? null });
  } catch (e: any) {
    // Never 500 the cron over a missing function (migration not applied yet) -
    // report it so the run log shows why, but let the schedule keep going.
    return NextResponse.json(
      { ok: false, table: "rollup_daily_orders", since, error: e?.message || "rollup rebuild failed" },
      { status: 200 },
    );
  }
}

export const GET = POST;
