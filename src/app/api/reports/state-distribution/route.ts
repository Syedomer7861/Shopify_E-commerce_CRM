import { NextRequest, NextResponse } from "next/server";
import { requireInternal, hasInternalSecret, getAuthenticatedSession } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { hasPermission } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

// Phase 2A-2a: thin guarded route in front of the reports_state_distribution
// SECURITY INVOKER function. Returns <= 12 aggregated rows + a grand total,
// never order rows.
const Q = z.object({
  start: z.string().min(8),
  end: z.string().min(8),
  state: z.string().optional().default("all"),
  segment: z.string().optional().default("all"),
  paymentMode: z.string().optional().default("all"),
});

export async function GET(req: NextRequest) {
  // 1. Signed-in / internal-secret gate.
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  // 2. Explicit analytics permission - same gate the Reports page enforces
  //    client-side, now enforced server-side so the endpoint can't be used
  //    to bypass the UI. Cron/internal-secret callers skip (there are none).
  if (!hasInternalSecret(req)) {
    const { profile } = await getAuthenticatedSession();
    if (!hasPermission(profile, "view_analytics")) {
      return NextResponse.json({ error: "Forbidden: analytics access required" }, { status: 403 });
    }
  }

  // 3. Abuse cap.
  const limited = rateLimit(req, "reports-state-distribution", 60, 60_000);
  if (limited) return limited;

  // 4. Validate params.
  const parsed = Q.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { start, end, state, segment, paymentMode } = parsed.data;

  // 5. Call the RPC as the caller (anon key + session cookie) - NOT service
  //    role. RLS on rollup_daily_state_orders / orders / customers applies.
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("reports_state_distribution", {
    p_start: start.slice(0, 10),
    p_end: end.slice(0, 10),
    p_state: state,
    p_segment: segment,
    p_payment: paymentMode,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}
