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
const BATCH_LIMIT = 150;

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  // Ops/testing escape hatch: process exactly one customer by id instead
  // of scanning the real backlog.
  const onlyCustomerId = req.nextUrl.searchParams.get("customerId");

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyDaysAgoStr = sixtyDaysAgo.toISOString();

  let dormantQuery = supabase
    .from("customers")
    .select("id, name, last_order_date, segment")
    .lt("last_order_date", sixtyDaysAgoStr)
    .not("last_order_date", "is", null);
  dormantQuery = onlyCustomerId ? dormantQuery.eq("id", onlyCustomerId) : dormantQuery.limit(BATCH_LIMIT);

  const { data: dormantCustomers, error } = await dormantQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let winbackTasks = 0;

  for (const cust of dormantCustomers || []) {
    // Check if they already have an active win_back task
    const { count: existingWinback } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", cust.id)
      .eq("task_type", "win_back")
      .not("status", "in", '("done","cancelled","skipped")');

    if ((existingWinback || 0) > 0) continue;

    // Assign to best available agent for re-engagement
    const assignedTo = await assignTaskOwner(supabase, "win_back", cust.segment);
    const { error: winErr } = await supabase.from("tasks").insert({
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

  return NextResponse.json({ winbackTasks, scanned: dormantCustomers?.length || 0 });
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
