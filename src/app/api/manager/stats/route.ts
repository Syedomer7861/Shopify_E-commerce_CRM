import { NextRequest, NextResponse } from "next/server";
import { requireInternal, hasInternalSecret, getAuthenticatedSession } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

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
  const today = new Date().toISOString().split("T")[0];

  try {
    // All three counts run concurrently - three sequential round trips was
    // enough to blow the function timeout while the Supabase project is
    // throttled (over-quota), leaving the Manager Hub KPI cards on "...".
    const [audit, agents, ndr] = await Promise.all([
      // Audit Queue: tasks done but not yet manager-verified (same filter
      // ManagerTaskReview uses).
      supabase.from("tasks").select("*", { count: "exact", head: true })
        .eq("status", "done").eq("is_processed_by_manager", false),
      // Active Agents: online profiles, demo logins excluded.
      supabase.from("profiles").select("*", { count: "exact", head: true })
        .eq("status", "online")
        .not("email", "ilike", "%demo%").not("name", "ilike", "%demo%")
        .or("is_demo.is.null,is_demo.eq.false"),
      // NDR Resolved today.
      supabase.from("tasks").select("*", { count: "exact", head: true })
        .eq("task_type", "ndr").eq("status", "done")
        .gte("completed_at", `${today}T00:00:00Z`),
    ]);

    return NextResponse.json({
      auditQueue: audit.count || 0,
      activeAgents: agents.count || 0,
      ndrResolved: ndr.count || 0,
      security: "Active",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "stats query failed" }, { status: 500 });
  }
}
