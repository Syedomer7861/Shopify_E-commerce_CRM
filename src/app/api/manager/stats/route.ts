import { NextRequest, NextResponse } from "next/server";
import { requireInternal, hasInternalSecret, getAuthenticatedSession } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  // requireInternal only checks "logged in" - this page is manager/admin
  // only client-side (ManagerHubPage), but the route itself had no matching
  // check. tasks RLS (20260427_rls_hardening.sql) happens to cap a plain
  // agent's own query to their own rows, so this wasn't a full data leak,
  // but relying on that as the only backstop is fragile - add the explicit
  // check other manager/admin routes already use.
  if (!hasInternalSecret(req)) {
    const { profile } = await getAuthenticatedSession();
    if (profile?.role !== "admin" && profile?.role !== "manager") {
      return NextResponse.json({ error: "Forbidden: Admin or Manager access required" }, { status: 403 });
    }
  }

  const supabase = createServerClient();

  try {
    // 1. Audit Queue (Tasks with status 'done' but not yet verified).
    // Was missing is_processed_by_manager=false - counted every task ever
    // completed, all-time, instead of the real actionable queue (the same
    // filter ManagerTaskReview.tsx itself uses below this card). Grew
    // forever and never reflected what a manager actually had left to do.
    const { count: auditCount } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "done")
      .eq("is_processed_by_manager", false);

    // 2. Active Agents (Profiles with status 'online'). Same demo exclusion
    // used elsewhere - otherwise a demo login inflates this live KPI.
    const { count: activeAgents } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("status", "online")
      .not("email", "ilike", "%demo%")
      .not("name", "ilike", "%demo%")
      .or('is_demo.is.null,is_demo.eq.false');

    // 3. NDR Resolved (Tasks with type 'ndr' and status 'done' today)
    const today = new Date().toISOString().split("T")[0];
    const { count: ndrResolved } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("task_type", "ndr")
      .eq("status", "done")
      .gte("completed_at", `${today}T00:00:00Z`);

    return NextResponse.json({
      auditQueue: auditCount || 0,
      activeAgents: activeAgents || 0,
      ndrResolved: ndrResolved || 0,
      security: "Active"
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
