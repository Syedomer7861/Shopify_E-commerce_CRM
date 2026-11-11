import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePrivileged } from "@/lib/auth-utils";

// Scheduler entry point for the platform engine. All three jobs are SQL
// functions (20261111d/e/f) executable by the service role only:
//   process_workflow_events - run business rules against queued events
//   run_work_escalations    - stale approvals / overdue tasks -> manager
//   run_sla_checks          - tickets past SLA, invoices past due
// A function that isn't installed yet reports its error and the rest still run.
const JOBS = ["process_workflow_events", "run_work_escalations", "run_sla_checks"] as const;

export async function POST(req: NextRequest) {
  const unauthorized = await requirePrivileged(req, ["manage_automations"]);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const results: Record<string, number | string> = {};
  for (const job of JOBS) {
    const { data, error } = await supabase.rpc(job);
    results[job] = error ? `error: ${error.message}` : (data as number);
  }
  return NextResponse.json({ success: true, data: results });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
