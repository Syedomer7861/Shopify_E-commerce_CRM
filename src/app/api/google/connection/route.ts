import { NextRequest, NextResponse } from "next/server";
import { ensureAdmin } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { backupOrgToDrive, getOrgGoogle, googleAppConfigured, googleOAuthClient } from "@/lib/google-org";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOUR = 60 * 60 * 1000;

/** Connection status for the admin's own org. Never returns the token. */
export async function GET() {
  const { errorResponse, profile } = await ensureAdmin();
  if (errorResponse) return errorResponse;
  const conn = profile?.org_id ? await getOrgGoogle(profile.org_id) : null;
  return NextResponse.json({
    enabled: googleAppConfigured(),
    connected: Boolean(conn),
    email: conn?.email ?? null,
    sheetUrl: conn?.sheet_id ? `https://docs.google.com/spreadsheets/d/${conn.sheet_id}` : null,
    lastBackupAt: conn?.last_backup_at ?? null,
    lastBackupStatus: conn?.last_backup_status ?? null,
    fieldPhotosToDrive: conn?.field_photos_to_drive ?? false,
    fieldVisitsToSheet: conn?.field_visits_to_sheet ?? false,
  });
}

/** Field visit switches: proof photos into Drive, visit rows into the sheet. */
export async function PATCH(req: NextRequest) {
  const { errorResponse, profile } = await ensureAdmin();
  if (errorResponse) return errorResponse;
  const body = await req.json().catch(() => ({}));
  const change: Record<string, boolean> = {};
  if (typeof body?.fieldPhotosToDrive === "boolean") change.field_photos_to_drive = body.fieldPhotosToDrive;
  if (typeof body?.fieldVisitsToSheet === "boolean") change.field_visits_to_sheet = body.fieldVisitsToSheet;
  if (!profile?.org_id || !Object.keys(change).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  const { data, error } = await createAdminClient().from("org_google_connections").update(change).eq("org_id", profile.org_id).select("org_id");
  if (error) return NextResponse.json({ error: /column/.test(error.message) ? "This needs the latest update. Ask support." : "Could not save" }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Connect Google first." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** Back up now (at most once an hour). */
export async function POST() {
  const { errorResponse, profile } = await ensureAdmin();
  if (errorResponse) return errorResponse;
  const conn = profile?.org_id ? await getOrgGoogle(profile.org_id) : null;
  if (!conn) return NextResponse.json({ error: "Connect Google first." }, { status: 400 });
  if (conn.last_backup_at && Date.now() - Date.parse(conn.last_backup_at) < HOUR) {
    return NextResponse.json({ error: "A backup ran in the last hour. Try again later." }, { status: 429 });
  }
  const started = Date.now();
  const result = await backupOrgToDrive(conn, () => Date.now() - started > 50_000);
  return NextResponse.json(result, { status: result.status === "ok" || result.status === "partial" ? 200 : 502 });
}

/** Disconnect: revoke at Google and forget the token. */
export async function DELETE(_req: NextRequest) {
  const { errorResponse, profile } = await ensureAdmin();
  if (errorResponse) return errorResponse;
  if (!profile?.org_id) return NextResponse.json({ ok: true });
  const conn = await getOrgGoogle(profile.org_id);
  if (conn) {
    try { await googleOAuthClient().revokeToken(conn.refresh_token); } catch { /* already revoked at Google */ }
    await createAdminClient().from("org_google_connections").delete().eq("org_id", profile.org_id);
  }
  return NextResponse.json({ ok: true });
}
