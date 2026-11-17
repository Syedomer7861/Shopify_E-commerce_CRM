/**
 * eSSL / ZKTeco punch handling shared by the device push route (ADMS),
 * the PC sync agent API and the file import.
 *
 * Devices record wall-clock time with no zone. A punch "2026-11-18 09:05:00"
 * on a device set to IST (offset 330) is 03:35:00Z.
 */
export type PunchRow = {
  employee_code: string;
  punched_at: string; // ISO UTC
  direction: "in" | "out" | null;
};

const CODE = /^[A-Za-z0-9_-]{1,24}$/;
const LOCAL_TS = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/** "YYYY-MM-DD HH:MM[:SS]" in device local time -> ISO UTC, or null if malformed. */
export function localToUtc(local: string, tzOffsetMinutes: number): string | null {
  const m = LOCAL_TS.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(v => Number(v ?? 0));
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s) - tzOffsetMinutes * 60_000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** ZK attendance state: 0 check-in, 1 check-out, 4 OT-in, 5 OT-out. Others (break) carry no direction. */
function direction(state: string | undefined): "in" | "out" | null {
  if (state === "0" || state === "4") return "in";
  if (state === "1" || state === "5") return "out";
  return null;
}

export function cleanPunch(code: unknown, at: string | null, dir: "in" | "out" | null = null): PunchRow | null {
  const c = typeof code === "string" ? code.trim() : typeof code === "number" ? String(code) : "";
  if (!CODE.test(c) || !at) return null;
  // Ignore punches from a device clock set to the far future or past.
  const t = Date.parse(at);
  if (!Number.isFinite(t) || t > Date.now() + 86_400_000 || t < Date.parse("2015-01-01")) return null;
  return { employee_code: c, punched_at: new Date(t).toISOString(), direction: dir };
}

/**
 * ADMS ATTLOG body: one punch per line,
 * "PIN\tYYYY-MM-DD HH:MM:SS\tState\tVerify\tWorkcode...".
 */
export function parseAttlog(body: string, tzOffsetMinutes: number): PunchRow[] {
  const out: PunchRow[] = [];
  for (const line of body.split(/\r?\n/)) {
    const f = line.split("\t");
    if (f.length < 2) continue;
    const p = cleanPunch(f[0], localToUtc(f[1], tzOffsetMinutes), direction(f[2]?.trim()));
    if (p) out.push(p);
  }
  return out;
}

/** Drops duplicates inside one batch (the DB unique key handles the rest). */
export function dedupe(rows: PunchRow[]): PunchRow[] {
  const seen = new Set<string>();
  return rows.filter(r => {
    const k = `${r.employee_code}|${r.punched_at}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const MAX_PUNCHES_PER_REQUEST = 2000;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Excel cell dates come back as UTC wall-clock Dates; anything else as text. */
function cellText(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  return v == null ? "" : String(v).trim();
}

function parseDatePart(s: string): string | null {
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s); // eSSL reports are day-first
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{4})/.exec(s);
  if (m) { const mo = MONTHS.indexOf(m[2].toLowerCase()); if (mo >= 0) return `${m[3]}-${pad(mo + 1)}-${pad(+m[1])}`; }
  return null;
}

function parseTimePart(s: string): string | null {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/.exec(s);
  if (!m) return null;
  let h = +m[1];
  const ap = m[4]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return `${pad(h)}:${m[2]}:${m[3] ?? "00"}`;
}

/**
 * One cell holding date+time, or a date cell plus a separate time cell, to
 * "YYYY-MM-DD HH:MM:SS" (device local). Null when either part is missing,
 * so a blank "Out Time" never becomes a made-up punch.
 */
export function parseLocalDateTime(dateCell: unknown, timeCell?: unknown): string | null {
  const d = cellText(dateCell);
  const date = parseDatePart(d);
  if (!date) return null;
  const t = timeCell === undefined ? d.slice(d.search(/\d{1,2}:\d{2}/) >= 0 ? d.search(/\d{1,2}:\d{2}/) : d.length) : cellText(timeCell);
  const time = t ? parseTimePart(t) : null;
  return time ? `${date} ${time}` : null;
}
