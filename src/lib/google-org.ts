import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { Readable } from "stream";
import { createAdminClient } from "@/lib/supabase";

/**
 * Per-organisation Google Drive & Sheets. Each org connects its own Google
 * account (Settings > Backup & data) through the platform's Google OAuth app
 * (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Scope is drive.file only: the
 * CRM can see and edit just the files it created, nothing else in the Drive.
 *
 * Tokens live in org_google_connections (service-role only) and never reach
 * a browser. Server-only module.
 */
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email"];
const FOLDER = "CodeCrest backups";

// The customer-facing OAuth client (GOOGLE_ORG_CLIENT_*), kept apart from the
// platform backup's GOOGLE_CLIENT_* so switching one never breaks the other.
const clientId = () => process.env.GOOGLE_ORG_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const clientSecret = () => process.env.GOOGLE_ORG_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
export const googleAppConfigured = () => Boolean(clientId() && clientSecret());
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://cureforever-crm.vercel.app").replace(/\/$/, "");
export const googleRedirectUri = () => `${appUrl()}/api/google/callback`;

export function googleOAuthClient() {
  return new OAuth2Client(clientId(), clientSecret(), googleRedirectUri());
}

export type OrgGoogle = {
  org_id: string; refresh_token: string; email: string | null; sheet_id: string | null; last_backup_at: string | null; last_backup_status: string | null;
  field_photos_to_drive?: boolean; field_visits_to_sheet?: boolean; field_folder_id?: string | null;
};
const CONN_COLS = "org_id, refresh_token, email, sheet_id, last_backup_at, last_backup_status";
const FIELD_COLS = ", field_photos_to_drive, field_visits_to_sheet, field_folder_id";

export async function getOrgGoogle(orgId: string): Promise<OrgGoogle | null> {
  const db = createAdminClient();
  // The field switches arrive with migration 20261118i; before it, read the base columns.
  const full = await db.from("org_google_connections").select(CONN_COLS + FIELD_COLS).eq("org_id", orgId).maybeSingle();
  if (!full.error) return full.data as OrgGoogle | null;
  const { data } = await db.from("org_google_connections").select(CONN_COLS).eq("org_id", orgId).maybeSingle();
  return data as OrgGoogle | null;
}

function authFor(conn: OrgGoogle) {
  const auth = googleOAuthClient();
  auth.setCredentials({ refresh_token: conn.refresh_token });
  return auth;
}

/** Spreadsheet cells: a leading = + - @ would run as a formula when opened. */
const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const line = (vals: unknown[]) => vals.map((v) => `"${cell(v).replace(/"/g, '""')}"`).join(",");
  return [line(headers), ...rows.map((r) => line(headers.map((h) => r[h])))].join("\n");
}

// Ordered by importance, like the platform backup: if time runs out the
// records that matter most are already saved. All carry org_id.
const TABLES = ["customers", "orders", "order_revenue_attribution", "tasks", "call_logs", "abandoned_carts", "profiles", "campaigns", "campaign_templates", "agent_attendance", "leaves", "workflows", "workflow_steps", "workflow_instances", "audit_logs"];
const SELECT: Record<string, string> = {
  audit_logs: "id, actor_email, entity_type, entity_id, action, summary, created_at",
  profiles: "id, name, email, role, department, is_active, created_at",
};

/**
 * Writes this org's own rows (and nothing else) as CSVs into "CodeCrest
 * backups" in the org's Drive. Stops cleanly at the deadline.
 */
export async function backupOrgToDrive(conn: OrgGoogle, expired: () => boolean) {
  const db = createAdminClient();
  const drive = google.drive({ version: "v3", auth: authFor(conn) });
  const date = new Date().toISOString().slice(0, 10);
  const saved: string[] = [];
  let status = "ok";
  try {
    const found = await drive.files.list({ q: `name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: "files(id)" });
    const folderId = found.data.files?.[0]?.id || (await drive.files.create({ requestBody: { name: FOLDER, mimeType: "application/vnd.google-apps.folder" }, fields: "id" })).data.id!;

    for (const table of TABLES) {
      if (expired()) { status = "partial"; break; }
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; !expired(); from += 1000) {
        const { data, error } = await db.from(table).select(SELECT[table] ?? "*").eq("org_id", conn.org_id).range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        rows.push(...((data as unknown as Record<string, unknown>[]) || []));
        if (!data || data.length < 1000) break;
      }
      if (!rows.length) continue;
      await drive.files.create({
        requestBody: { name: `${table}_${date}.csv`, parents: [folderId] },
        media: { mimeType: "text/csv", body: Readable.from([toCsv(rows)]) },
        fields: "id",
      });
      saved.push(table);
    }
  } catch (e: any) {
    // invalid_grant = the org removed access in their Google account.
    status = /invalid_grant|unauthorized_client/.test(String(e?.message)) ? "reconnect needed" : `error: ${String(e?.message).slice(0, 200)}`;
  }
  await db.from("org_google_connections").update({ last_backup_at: new Date().toISOString(), last_backup_status: status }).eq("org_id", conn.org_id);
  return { status, saved };
}

/** The org's live-data spreadsheet in its own Drive, created on first use. */
export async function openOrgSheet(conn: OrgGoogle) {
  const auth = authFor(conn);
  if (conn.sheet_id) {
    const doc = new GoogleSpreadsheet(conn.sheet_id, auth);
    await doc.loadInfo();
    return doc;
  }
  const doc = await GoogleSpreadsheet.createNewSpreadsheetDocument(auth, { title: "CodeCrest live data" });
  await createAdminClient().from("org_google_connections").update({ sheet_id: doc.spreadsheetId }).eq("org_id", conn.org_id);
  return doc;
}

export { cell as sheetCell };

const FIELD_FOLDER = "CodeCrest field visits";

/** Saves a check-in photo into "CodeCrest field visits" in the org's Drive. Private: no sharing is added. */
export async function uploadFieldPhoto(conn: OrgGoogle, photo: Buffer, name: string) {
  const drive = google.drive({ version: "v3", auth: authFor(conn) });
  let folderId = conn.field_folder_id || null;
  if (folderId) {
    // The folder may have been deleted or trashed in Drive since.
    const ok = await drive.files.get({ fileId: folderId, fields: "id, trashed" }).then(r => !r.data.trashed).catch(() => false);
    if (!ok) folderId = null;
  }
  if (!folderId) {
    folderId = (await drive.files.create({ requestBody: { name: FIELD_FOLDER, mimeType: "application/vnd.google-apps.folder" }, fields: "id" })).data.id!;
    await createAdminClient().from("org_google_connections").update({ field_folder_id: folderId }).eq("org_id", conn.org_id);
  }
  const file = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType: "image/jpeg", body: Readable.from([photo]) },
    fields: "id",
  });
  return file.data.id!;
}

/** Reads a file the CRM created back out of the org's Drive (drive.file scope). */
export async function readDriveFile(conn: OrgGoogle, fileId: string) {
  const drive = google.drive({ version: "v3", auth: authFor(conn) });
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(res.data as ArrayBuffer);
}

/** Sheet tab names can't hold : \ / ? * [ ] and max 100 chars (same rule as the old Apps Script). */
export const sheetTabName = (name: string) => name.replace(/[:\/?*[\]]/g, "").trim().slice(0, 100) || "Unknown";

/**
 * Field visit log in the org's live sheet: one row per event on the
 * "Field visits" tab, and the same row on a tab per executive.
 */
export async function appendFieldVisitRow(conn: OrgGoogle, row: Record<string, unknown>, executive: string) {
  const doc = await openOrgSheet(conn);
  const headers = Object.keys(row);
  const clean = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, cell(v)]));
  for (const title of ["Field visits", sheetTabName(executive)]) {
    const sheet = doc.sheetsByTitle[title] ?? await doc.addSheet({ title, headerValues: headers });
    // Tabs made before new columns were added get them appended on the right.
    await sheet.loadHeaderRow().catch(() => {});
    const have = sheet.headerValues || [];
    const missing = headers.filter(h => !have.includes(h));
    if (missing.length) {
      const all = [...have, ...missing];
      if (sheet.columnCount < all.length) await sheet.resize({ rowCount: sheet.rowCount, columnCount: all.length });
      await sheet.setHeaderRow(all);
    }
    await sheet.addRow(clean, { raw: true });
  }
}
