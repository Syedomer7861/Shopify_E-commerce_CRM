import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireInternal } from "@/lib/auth-utils";
import { makeDeadline } from "@/lib/sync-logic";

// Vercel Hobby caps functions at 60s; a higher value fails the deploy.
export const maxDuration = 60;

// webhook_logs has no retention policy and grows forever - every real
// webhook, every sync run's own log entry, permanent. Confirmed live: it
// was the single largest table in the database (44MB of ~107MB total real
// data), and kept growing with no cleanup. This is an audit/debugging
// trail, not business data - old enough to be useless for that purpose is
// old enough to delete. 60 days keeps a full two months of recent history
// for debugging while stopping unbounded growth.
const RETENTION_DAYS = 60;
// 1000 UUIDs in a single .in() filter blows PostgREST's URL length limit
// (confirmed live: got a flat 500 "Bad Request"). 200 stays comfortably
// under it, matching the batch size already used safely elsewhere in this
// codebase for the same kind of id-list filter.
const BATCH_SIZE = 200;

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const deadline = makeDeadline({ budgetMs: 45_000 });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

  let deleted = 0;
  let truncated = false;

  try {
    while (!deadline.expired()) {
      // Delete oldest-first, in batches - a single unbounded DELETE across
      // thousands of rows risks a long table lock and blowing the function
      // budget on one giant statement. select-ids-then-delete-by-id keeps
      // each round small and resumable.
      const { data: rows, error: selErr } = await supabase
        .from("webhook_logs")
        .select("id")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (selErr) throw selErr;
      if (!rows || rows.length === 0) break;

      const { error: delErr } = await supabase
        .from("webhook_logs")
        .delete()
        .in("id", rows.map(r => r.id));

      if (delErr) throw delErr;
      deleted += rows.length;

      if (rows.length < BATCH_SIZE) break; // fewer than a full batch - caught up
    }

    if (deadline.expired()) truncated = true;

    return NextResponse.json({ deleted, retention_days: RETENTION_DAYS, truncated });
  } catch (err: any) {
    console.error("prune-webhook-logs error:", err.message);
    return NextResponse.json({ error: err.message, deleted }, { status: 500 });
  }
}

export const GET = POST;
