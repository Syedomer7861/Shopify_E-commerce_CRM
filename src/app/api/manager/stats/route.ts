import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  try {
    // 1. Audit Queue (Tasks with status 'done' but not yet verified)
    const { count: auditCount } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "done");

    // 2. Active Agents (Profiles with status 'online')
    const { count: activeAgents } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("status", "online");

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
