import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { hasInternalSecret } from "@/lib/auth-utils";
import { uploadToDrive } from "@/lib/google-drive";
import { makeDeadline } from "@/lib/sync-logic";

// Vercel Hobby caps functions at 60s; a higher value fails the deploy.
export const maxDuration = 60;
// Leaves room for the response to actually return before the platform
// kills the function - a killed function returns a 504 with no report at
// all, so the caller never learns which tables made it.
const BACKUP_BUDGET_MS = 50_000;

/**
 * GET/POST /api/backup
 * Backs up every business-critical table to Google Drive as CSV.
 *
 * This previously listed 16 tables, 4 of which didn't exist in the real
 * schema at all (system_settings, leave_requests, agent_performance_metrics,
 * templates - guessed names, never verified against information_schema),
 * had no maxDuration (defaults well under what 16 sequential Drive
 * uploads need, so it likely never completed a single real run), fetched
 * with a flat .limit(5000) that silently truncates orders/webhook_logs
 * (20,000+ / 11,000+ real rows), and aborted the entire run on the first
 * table that errored. Scheduling something this broken would have just
 * produced a green "backup ran" checkmark that lied - fixed all four
 * before wiring this into the daily cron (see .github/workflows/cron.yml).
 */
async function handleBackup(req: NextRequest) {
  if (!hasInternalSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A full SELECT * of every table, uploaded off-site, was running daily and
  // was the single largest source of Supabase egress (~3 GB/mo on a 0.14 GB
  // DB). Supabase already takes its own automatic daily backups; this Drive
  // copy only needs to be the off-platform safety net, so it now self-gates
  // to Mondays (UTC) — same pattern as analytics-digest?range=weekly. The
  // daily cron trigger stays as-is; six days out of seven this is a no-op.
  const force = req.nextUrl.searchParams.get("force") === "true";
  if (new Date().getUTCDay() !== 1 && !force) {
    return NextResponse.json({ skipped: true, reason: "weekly backup runs Mondays (UTC); pass ?force=true to override" });
  }

  // Service-role client, not the cookie-scoped one: this route has no
  // session to inherit (cron calls it directly), and the anon key gets
  // silently RLS-blocked on most tables - confirmed live, every table but
  // abandoned_carts came back "empty" under the cookie-scoped client.
  const supabase = createAdminClient();
  // Ordered by importance - if the time budget runs out partway (a real
  // possibility on Hobby with a database this size), the tables that
  // matter most were backed up first, not whatever happened to sort
  // alphabetically.
  const tables = [
    "customers",
    "orders",
    "order_revenue_attribution",
    "tasks",
    "profiles",
    "call_logs",
    "abandoned_carts",
    "settings",
    "campaigns",
    "campaign_templates",
    "audit_logs",
    "agent_attendance",
    "leaves",
    "workflows",
    "workflow_instances",
    "workflow_logs",
  ];
  const timestamp = new Date().toISOString().split("T")[0];
  const results: any[] = [];
  const deadline = makeDeadline({ budgetMs: BACKUP_BUDGET_MS });

  const PAGE = 1000;
  async function fetchAllRows(table: string): Promise<any[]> {
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      if (deadline.expired()) break;
      const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  }

  for (const table of tables) {
    if (deadline.expired()) {
      results.push({ table, status: "skipped", reason: "out of time budget - will run next scheduled backup" });
      continue;
    }

    try {
      const data = await fetchAllRows(table);
      if (data.length === 0) {
        results.push({ table, status: "empty" });
        continue;
      }
      const csv = jsonToCsv(data);
      const filename = `${table}_backup_${timestamp}.csv`;
      const driveId = await uploadToDrive(filename, csv);
      results.push({ table, filename, driveId, rows: data.length });
    } catch (error: any) {
      // One bad table (a permissions issue, a transient Drive API error)
      // must not cost every table after it in the list - each table's
      // outcome is independent and reported on its own.
      console.error(`Backup failed for table ${table}:`, error.message);
      results.push({ table, status: "error", error: error.message });
    }
  }

  const failed = results.filter(r => r.status === "error").length;
  return NextResponse.json({
    success: failed === 0,
    timestamp: new Date().toISOString(),
    truncated: results.some(r => r.status === "skipped"),
    backups: results,
  });
}

export const GET = handleBackup;
// The cron workflow POSTs every scheduled endpoint (see .github/workflows/
// cron.yml).
export const POST = handleBackup;

/**
 * Simple JSON to CSV converter
 */
function jsonToCsv(data: any[]) {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map(obj =>
    headers.map(header => {
      let val = obj[header];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") val = JSON.stringify(val);
      // Escape quotes and wrap in quotes
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}
