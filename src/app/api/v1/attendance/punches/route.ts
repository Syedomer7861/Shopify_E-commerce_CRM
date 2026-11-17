import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError } from "@/lib/api-auth";
import { cleanPunch, localToUtc, MAX_PUNCHES_PER_REQUEST, type PunchRow } from "@/lib/biometric";
import { storePunches } from "@/lib/biometric-server";

/**
 * POST /api/v1/attendance/punches  (scope attendance:write)
 * Used by the eSSL PC sync agent. Body:
 *   { "device_serial": "optional", "tz_offset_minutes": 330,
 *     "punches": [{ "employee_code": "101", "time": "2026-11-18 09:05:00", "direction": "in" }] }
 * "time" is device local time (or a full ISO timestamp with zone).
 */
export async function POST(req: NextRequest) {
  const caller = await apiAuth(req, "attendance:write");
  if (caller instanceof NextResponse) return caller;
  const raw = await req.text();
  if (raw.length > 1_000_000) return apiError(413, "Send at most 2000 punches per request");
  let body: { device_serial?: unknown; tz_offset_minutes?: unknown; punches?: unknown };
  try { body = JSON.parse(raw); } catch { return apiError(400, "Body must be JSON"); }
  if (!Array.isArray(body.punches)) return apiError(400, "punches must be an array");
  if (body.punches.length > MAX_PUNCHES_PER_REQUEST) return apiError(413, "Send at most 2000 punches per request");
  const tz = Number.isInteger(body.tz_offset_minutes) && Math.abs(body.tz_offset_minutes as number) <= 840 ? (body.tz_offset_minutes as number) : 330;

  let deviceId: string | null = null;
  if (typeof body.device_serial === "string" && body.device_serial.trim()) {
    const { data } = await caller.admin.from("biometric_devices").select("id")
      .eq("org_id", caller.orgId).eq("serial_number", body.device_serial.trim()).maybeSingle();
    deviceId = data?.id ?? null;
  }

  const rows: PunchRow[] = [];
  let rejected = 0;
  for (const p of body.punches as Record<string, unknown>[]) {
    const t = typeof p?.time === "string" ? p.time : "";
    const at = /[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? t : localToUtc(t, tz);
    const dir = p?.direction === "in" || p?.direction === "out" ? p.direction : null;
    const row = cleanPunch(p?.employee_code, at, dir);
    if (row) rows.push(row); else rejected++;
  }
  const { count, error } = await storePunches(caller.admin, caller.orgId, deviceId, "agent", rows);
  if (error) return apiError(500, error);
  return NextResponse.json({ received: count, rejected });
}
