import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireOwnerOrInternal } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// Rebuilds the trailing window of rollup_daily_orders. Runs nightly (GitHub
// Actions daily group). A trailing window - not just yesterday - so late
// webhook updates that flip an old order's delivery_status get picked up.
export async function POST(req: NextRequest) {
  const unauthorized = await requireOwnerOrInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const days = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("days") || 3)));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  // Each rollup is independent - one missing function (migration not applied
  // yet) must not stop the others. Always 200 so the schedule never wedges.
  const results: Record<string, unknown> = { since };
  for (const fn of ["rebuild_rollup_orders", "rebuild_rollup_state_orders"] as const) {
    try {
      const { data, error } = await supabase.rpc(fn, { since });
      if (error) throw error;
      results[fn] = { ok: true, rows: data ?? null };
    } catch (e: any) {
      results[fn] = { ok: false, error: e?.message || "rebuild failed" };
    }
  }
  return NextResponse.json(results);
}

export const GET = POST;
