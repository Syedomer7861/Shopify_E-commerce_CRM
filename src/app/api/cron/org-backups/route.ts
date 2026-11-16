import { NextRequest, NextResponse } from "next/server";
import { hasInternalSecret } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { backupOrgToDrive, type OrgGoogle } from "@/lib/google-org";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily cron: weekly backup of each connected org into its own Google
 * Drive. Oldest first, as many as fit in the time budget; the rest run on
 * the next day's tick.
 */
async function run(req: NextRequest) {
  if (!hasInternalSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const expired = () => Date.now() - started > 50_000;
  const weekAgo = new Date(Date.now() - 6.5 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await createAdminClient()
    .from("org_google_connections")
    .select("org_id, refresh_token, email, sheet_id, last_backup_at, last_backup_status")
    .or(`last_backup_at.is.null,last_backup_at.lt.${weekAgo}`)
    .order("last_backup_at", { ascending: true, nullsFirst: true })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const conn of (data || []) as OrgGoogle[]) {
    if (expired()) break;
    const r = await backupOrgToDrive(conn, expired);
    results.push({ org_id: conn.org_id, status: r.status, tables: r.saved.length });
  }
  return NextResponse.json({ ran: results.length, due: data?.length ?? 0, results });
}

export const GET = run;
export const POST = run;
