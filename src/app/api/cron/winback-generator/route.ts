import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { assignTaskOwner } from "@/lib/task-engine";
import { requireInternal } from "@/lib/auth-utils";

// Split out of /api/cron/task-generator - see the comment at the top of
// that route for why. Creates a win_back task for customers dormant 60+
// days. This phase used to run last in a single three-phase function and
// confirmed live to have NEVER once completed - 0 rows ever despite
// 1,224 real dormant customers qualifying right now - because the two
// phases ahead of it in that shared 60s budget starved it of any
// execution time.
export const maxDuration = 60;
const BATCH_LIMIT = 50;

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  // Ops/testing escape hatch: process exactly one customer by id instead
  // of scanning the real backlog. Org-agnostic - the customer itself pins the org.
  const onlyCustomerId = req.nextUrl.searchParams.get("customerId");

  if (onlyCustomerId) {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, org_id, last_order_date, segment")
      .eq("id", onlyCustomerId)
      .lt("last_order_date", sixtyDaysAgo.toISOString());
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) return NextResponse.json({ winbackTasks: 0, scanned: 0 });
    const result = await processDormantCustomers(supabase, data[0].org_id, data);
    return NextResponse.json(result);
  }

  const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
  let winbackTasks = 0, scanned = 0;
  for (const org of orgs ?? []) {
    // customers_needing_winback (migrations/20260827e_task_backlog_rpcs.sql,
    // org-scoped in 20261106a) already excludes customers who have the
    // task and orders by id - a plain .limit(N) with no ordering and no
    // exclusion filter was confirmed live (on the sibling
    // issue-task-generator route) to make zero real progress across
    // repeated calls.
    const { data, error } = await supabase.rpc("customers_needing_winback", { limit_n: BATCH_LIMIT, target_org_id: org.id });
    if (error) { console.error(`winback-generator RPC failed for org ${org.id}:`, error.message); continue; }
    if (!data?.length) continue;
    const result = await processDormantCustomers(supabase, org.id, data);
    winbackTasks += result.winbackTasks;
    scanned += result.scanned;
  }
  return NextResponse.json({ winbackTasks, scanned });
}

async function processDormantCustomers(supabase: any, orgId: string, dormantCustomers: any[]) {
  let winbackTasks = 0;

  for (const cust of dormantCustomers || []) {
    // Assign to best available agent for re-engagement
    const assignedTo = await assignTaskOwner(supabase, "win_back", cust.segment);
    const { error: winErr } = await supabase.from("tasks").insert({
      org_id: orgId,
      customer_id: cust.id,
      assigned_to: assignedTo,
      task_type: "win_back",
      due_date: new Date().toISOString().split("T")[0],
      priority_score: 60,
      status: "pending"
    });

    if (!winErr) winbackTasks++;
    else console.error(`win_back task insert failed for customer ${cust.id}:`, winErr.message);
  }

  return { winbackTasks, scanned: dormantCustomers?.length || 0 };
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
