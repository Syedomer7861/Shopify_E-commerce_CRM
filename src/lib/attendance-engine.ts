/**
 * Derives daily attendance (status, clock-in/out, productive and break
 * minutes) from the raw agent_attendance status-change log.
 *
 * agent_attendance holds one row per status transition (online/break/
 * offline/...), not one row per day - Sidebar.tsx only inserts a new row
 * when the agent's status actually changes. An agent who logs in Monday and
 * doesn't touch the status dropdown again until Friday produces exactly two
 * rows, four days apart.
 *
 * The previous version of this computation attributed the whole Mon-Fri
 * interval to Monday's calendar date alone (it capped the interval at the
 * *start* event's day-end, then never advanced to the next day), so Tuesday
 * through Thursday showed no attendance at all despite the agent being
 * logged in the entire time. This version walks every interval one
 * calendar day at a time and splits the minutes across every day it spans.
 *
 * All day-bucketing and lateness comparisons are done in IST (UTC+5:30,
 * no DST), not the UTC date embedded in the timestamp - a Night-shift
 * agent clocking in at 1am IST is still on UTC's *previous* calendar day,
 * which would silently misfile their attendance onto the wrong date.
 */

const IST_OFFSET_MINUTES = 5.5 * 60;

/** Statuses that count as productive work time. */
const PRODUCTIVE_STATUSES = new Set(["online", "meeting", "training"]);
/** Statuses that count as a break, not absence and not work. */
const BREAK_STATUSES = new Set(["break", "lunch", "away"]);

/** Shift start time, in minutes since local midnight (IST). */
export const SHIFT_START_MINUTES: Record<string, number> = {
  Morning: 9 * 60,
  Afternoon: 13 * 60,
  Night: 21 * 60,
  Off: -1, // Off-shift agents are never marked late.
};

/** Minutes of grace after shift start before a clock-in counts as late. */
export const LATE_GRACE_MINUTES = 15;

/** Per-org overrides from org_shift_timings; missing shift types use the defaults above. */
export type ShiftTimings = Record<string, { start: number; grace: number }>;

function lateFor(shiftType: string, clockIn: Date | null, timings: ShiftTimings) {
  const t = timings[shiftType];
  const start = t ? t.start : (SHIFT_START_MINUTES[shiftType] ?? SHIFT_START_MINUTES.Morning);
  const grace = t ? t.grace : LATE_GRACE_MINUTES;
  if (!clockIn || start < 0 || shiftType === "Off") return false;
  return toISTDateParts(clockIn).minutesSinceMidnight > start + grace;
}

/** Minimum productive minutes to count as a full day. */
export const FULL_DAY_MINUTES = 360; // 6h
/** Minimum productive minutes to count as a half day. */
export const HALF_DAY_MINUTES = 180; // 3h

/**
 * Nothing ever inserts a closing "offline" event on its own - no cron and no
 * heartbeat does it. An interval only closes when the agent next touches the
 * status dropdown (or it is still open, ending at "now"). If someone leaves
 * their laptop "online" over a long weekend, the gap until their next status
 * change would otherwise get credited as productive time on every day it
 * spans, including days they never worked. Cap a single interval's credited
 * span at one generous shift-plus-overtime; anything past that is simply not
 * credited to any day, rather than guessed at.
 */
const MAX_CREDITED_INTERVAL_MINUTES = 16 * 60;

export type AttendanceStatus = "Present" | "Absent" | "Half Day" | "Late" | "Leave" | "Holiday";

export interface RawStatusEvent {
  agent_id: string;
  status: string;
  created_at: string;
}

export interface ManualAttendanceRow {
  agent_id: string;
  date: string;
  status: string;
  clock_in?: string | null;
  clock_out?: string | null;
  productive_minutes?: number | null;
  break_minutes?: number | null;
}

export interface ComputedAttendanceRow {
  agent_id: string;
  date: string;
  status: AttendanceStatus;
  clock_in: string | null;
  clock_out: string | null;
  productive_minutes: number;
  break_minutes: number;
  is_auto: boolean;
  is_late: boolean;
  /** Biometric days only. */
  source?: "biometric";
  punch_count?: number;
  missing_out?: boolean;
  late_by_minutes?: number;
}

function toISTDateParts(d: Date) {
  const ist = new Date(d.getTime() + IST_OFFSET_MINUTES * 60000);
  const dateStr = ist.toISOString().slice(0, 10);
  const minutesSinceMidnight = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return { dateStr, minutesSinceMidnight };
}

interface DayBucket {
  productiveMinutes: number;
  breakMinutes: number;
  clockIn: Date | null;
  clockOut: Date | null;
}

/**
 * Computes per-day attendance for every agent from their raw status-change
 * events, then overlays manual (HR-entered) rows on top - a manual entry
 * for a given agent+date always wins over the auto-computed one.
 */
export function computeAutoAttendance(
  rawLogs: RawStatusEvent[],
  manualLogs: ManualAttendanceRow[],
  shiftByAgent: Record<string, string>,
  timings: ShiftTimings = {},
  biometric: ComputedAttendanceRow[] = []
): ComputedAttendanceRow[] {
  const byAgent = new Map<string, RawStatusEvent[]>();
  for (const log of rawLogs) {
    if (!log.created_at) continue;
    if (!byAgent.has(log.agent_id)) byAgent.set(log.agent_id, []);
    byAgent.get(log.agent_id)!.push(log);
  }

  const buckets = new Map<string, DayBucket>(); // key: `${agentId}::${date}`
  const bucketFor = (agentId: string, date: string) => {
    const key = `${agentId}::${date}`;
    if (!buckets.has(key)) {
      buckets.set(key, { productiveMinutes: 0, breakMinutes: 0, clockIn: null, clockOut: null });
    }
    return buckets.get(key)!;
  };

  for (const [agentId, events] of byAgent) {
    const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));

    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      const status = curr.status?.toLowerCase();
      const isProductive = PRODUCTIVE_STATUSES.has(status);
      const isBreak = BREAK_STATUSES.has(status);
      if (!isProductive && !isBreak) continue; // offline etc. - no time to attribute

      const intervalStart = new Date(curr.created_at);
      let intervalEnd = next ? new Date(next.created_at) : new Date();
      if (intervalEnd <= intervalStart) continue;

      const cap = new Date(intervalStart.getTime() + MAX_CREDITED_INTERVAL_MINUTES * 60000);
      if (intervalEnd > cap) intervalEnd = cap;

      let cursor = intervalStart;
      while (cursor < intervalEnd) {
        const { dateStr } = toISTDateParts(cursor);
        // End of this IST calendar day, expressed back in UTC.
        const istCursor = new Date(cursor.getTime() + IST_OFFSET_MINUTES * 60000);
        const istDayEndUTC = new Date(Date.UTC(
          istCursor.getUTCFullYear(), istCursor.getUTCMonth(), istCursor.getUTCDate() + 1
        ));
        const dayEndInSourceTz = new Date(istDayEndUTC.getTime() - IST_OFFSET_MINUTES * 60000);

        const segmentEnd = intervalEnd < dayEndInSourceTz ? intervalEnd : dayEndInSourceTz;
        const minutes = Math.max(0, Math.round((segmentEnd.getTime() - cursor.getTime()) / 60000));

        const bucket = bucketFor(agentId, dateStr);
        if (isProductive) {
          bucket.productiveMinutes += minutes;
          if (!bucket.clockIn || cursor < bucket.clockIn) bucket.clockIn = cursor;
          if (!bucket.clockOut || segmentEnd > bucket.clockOut) bucket.clockOut = segmentEnd;
        } else {
          bucket.breakMinutes += minutes;
          if (!bucket.clockOut || segmentEnd > bucket.clockOut) bucket.clockOut = segmentEnd;
        }

        cursor = segmentEnd;
      }
    }
  }

  const computed: ComputedAttendanceRow[] = [];
  for (const [key, bucket] of buckets) {
    const [agentId, date] = key.split("::");
    const isLate = lateFor(shiftByAgent[agentId] || "Morning", bucket.clockIn, timings);

    let status: AttendanceStatus;
    if (bucket.productiveMinutes >= FULL_DAY_MINUTES) status = isLate ? "Late" : "Present";
    else if (bucket.productiveMinutes >= HALF_DAY_MINUTES) status = "Half Day";
    else if (bucket.productiveMinutes > 0) status = "Late";
    else continue; // Break-only with zero productive time isn't a day worth reporting.

    computed.push({
      agent_id: agentId,
      date,
      status,
      clock_in: bucket.clockIn ? bucket.clockIn.toISOString() : null,
      clock_out: bucket.clockOut ? bucket.clockOut.toISOString() : null,
      productive_minutes: bucket.productiveMinutes,
      break_minutes: bucket.breakMinutes,
      is_auto: true,
      is_late: isLate,
    });
  }

  // Manual entries win. Build a lookup so we can drop any auto row a manual
  // one already covers, then merge both into one list.
  const manualKeys = new Set(manualLogs.map((m) => `${m.agent_id}::${m.date}`));
  // Once someone punches on the device, the device is their attendance: CRM
  // login time no longer creates days for them from their first punch onward
  // (a CRM login is not proof of being in the office).
  const firstBioDay = new Map<string, string>();
  for (const b of biometric) {
    const prev = firstBioDay.get(b.agent_id);
    if (!prev || b.date < prev) firstBioDay.set(b.agent_id, b.date);
  }
  const autoOnly = [
    ...biometric,
    ...computed.filter((c) => {
      const since = firstBioDay.get(c.agent_id);
      return !since || c.date < since;
    }),
  ].filter((c) => !manualKeys.has(`${c.agent_id}::${c.date}`));

  const manualAsComputed: ComputedAttendanceRow[] = manualLogs.map((m) => ({
    agent_id: m.agent_id,
    date: m.date,
    status: m.status as AttendanceStatus,
    clock_in: m.clock_in ?? null,
    clock_out: m.clock_out ?? null,
    productive_minutes: m.productive_minutes ?? 0,
    break_minutes: m.break_minutes ?? 0,
    is_auto: false,
    is_late: m.status === "Late",
  }));

  return [...manualAsComputed, ...autoOnly];
}

/** One row per employee per IST day, from the biometric_daily() DB function. */
export interface BiometricDay { agent_id: string; day: string; first_at: string; last_at: string; n: number }

/** Punches closer together than this are a double-tap at the door, not an in and an out. */
export const MIN_SPAN_MINUTES = 30;

/** Minutes after shift start + grace that the first punch landed (0 when on time). */
export function lateByMinutes(shiftType: string, clockIn: Date, timings: ShiftTimings = {}) {
  const t = timings[shiftType];
  const start = t ? t.start : (SHIFT_START_MINUTES[shiftType] ?? SHIFT_START_MINUTES.Morning);
  const grace = t ? t.grace : LATE_GRACE_MINUTES;
  if (start < 0 || shiftType === "Off") return 0;
  return Math.max(0, toISTDateParts(clockIn).minutesSinceMidnight - (start + grace));
}

/**
 * Daily attendance from biometric punches: first punch of the IST day is
 * clock-in, last is clock-out, the span between them is time on site.
 * - in + out >= 6h: Present, or Late when the first punch was after start + grace.
 * - in + out under 6h: Half Day (left early).
 * - only one punch (or two within 30 min): the person came in but the out-punch
 *   is missing. Status follows the in-time (Present/Late) and missing_out is set
 *   so HR can see and correct it - it is not guessed as a Half Day.
 */
export function computeBiometricDays(
  rows: BiometricDay[],
  shiftByAgent: Record<string, string>,
  timings: ShiftTimings = {}
): ComputedAttendanceRow[] {
  const out: ComputedAttendanceRow[] = [];
  for (const r of rows) {
    const first = new Date(r.first_at), last = new Date(r.last_at);
    if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) continue;
    const span = Math.round((last.getTime() - first.getTime()) / 60000);
    const missingOut = r.n < 2 || span < MIN_SPAN_MINUTES;
    const minutes = missingOut ? 0 : span;
    const shift = shiftByAgent[r.agent_id] || "Morning";
    const isLate = lateFor(shift, first, timings);
    const status: AttendanceStatus =
      missingOut || minutes >= FULL_DAY_MINUTES ? (isLate ? "Late" : "Present") : "Half Day";
    out.push({
      agent_id: r.agent_id, date: r.day, status,
      clock_in: first.toISOString(),
      clock_out: missingOut ? null : last.toISOString(),
      productive_minutes: minutes, break_minutes: 0,
      is_auto: true, is_late: isLate,
      source: "biometric", punch_count: r.n, missing_out: missingOut,
      late_by_minutes: lateByMinutes(shift, first, timings),
    });
  }
  return out;
}
