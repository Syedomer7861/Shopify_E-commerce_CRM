/**
 * Monthly pay from attendance (calendar-day method used by most Indian
 * payrolls): earned gross = monthly gross x paid days / days in month.
 *
 * Paid days: Present/Late 1, Half Day 0.5, Leave/Holiday 1, weekly off 1,
 * approved leave request 1, Absent or no record on a working day 0 (LOP),
 * days before joining 0. Late cuts from the org rules take 0.5 each. In the
 * running month, days not over yet are assumed paid so the figure is a
 * projection until the month ends.
 */
import { DEFAULT_POLICY, isWeeklyOff, lateDeductions, type AttendancePolicy } from "@/lib/attendance-engine";

export interface PayInput {
  month: string; // YYYY-MM
  today: string; // YYYY-MM-DD
  monthlySalary: number;
  joiningDate?: string | null;
  attendance: { date: string; status: string }[]; // this employee only
  holidays: string[]; // YYYY-MM-DD
  approvedLeaves: { start_date: string; end_date: string }[]; // this employee only
  policy?: AttendancePolicy;
  adjustDays?: number; // HR +/- correction to paid days
}

export interface PayResult {
  daysInMonth: number;
  present: number; late: number; halfDay: number; absent: number; unmarked: number;
  leave: number; holiday: number; weeklyOff: number; beforeJoining: number; upcoming: number;
  lateCuts: number; adjustDays: number;
  paidDays: number; lopDays: number;
  gross: number; earned: number;
  basic: number; hra: number; special: number; pf: number; pt: number; tds: number; net: number;
  inProgress: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const half = (n: number) => Math.round(n * 2) / 2;

export function computeMonthPay(input: PayInput): PayResult {
  const policy = input.policy ?? DEFAULT_POLICY;
  const [y, m] = input.month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDate = new Map(input.attendance.map((a) => [a.date, a.status]));
  const holidays = new Set(input.holidays);
  const joined = input.joiningDate && /^\d{4}-\d{2}-\d{2}/.test(input.joiningDate) ? input.joiningDate.slice(0, 10) : "";
  const c = { present: 0, late: 0, halfDay: 0, absent: 0, unmarked: 0, leave: 0, holiday: 0, weeklyOff: 0, beforeJoining: 0, upcoming: 0 };
  let paid = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${input.month}-${pad(d)}`;
    if (joined && date < joined) { c.beforeJoining++; continue; }
    const status = byDate.get(date);
    if (!status && date >= input.today) { c.upcoming++; paid += 1; continue; }
    switch (status) {
      case "Present": c.present++; paid += 1; continue;
      case "Late": c.late++; paid += 1; continue;
      case "Half Day": c.halfDay++; paid += 0.5; continue;
      case "Absent": c.absent++; continue;
      case "Leave": c.leave++; paid += 1; continue;
      case "Holiday": c.holiday++; paid += 1; continue;
    }
    if (holidays.has(date)) { c.holiday++; paid += 1; }
    else if (input.approvedLeaves.some((l) => l.start_date <= date && l.end_date >= date)) { c.leave++; paid += 1; }
    else if (isWeeklyOff(date, policy)) { c.weeklyOff++; paid += 1; }
    else c.unmarked++;
  }

  const lateCuts = lateDeductions(c.late, policy);
  const adjustDays = half(Math.max(-31, Math.min(31, Number(input.adjustDays) || 0)));
  const workable = daysInMonth - c.beforeJoining;
  const paidDays = half(Math.max(0, Math.min(workable, paid - lateCuts * 0.5 + adjustDays)));
  const lopDays = half(workable - paidDays);

  const gross = Math.max(0, Number(input.monthlySalary) || 0);
  const earned = Math.round((gross * paidDays) / daysInMonth);
  // Same structure the payroll register already used, applied to earned pay.
  const basic = Math.round(earned * 0.5);
  const hra = Math.round(basic * 0.4);
  const special = earned - basic - hra;
  const pf = Math.round(basic * 0.12);
  const pt = earned > 0 ? 200 : 0;
  const tds = earned > 41666 ? Math.round(earned * 0.05) : 0;
  const net = earned > 0 ? earned - pf - pt - tds : 0;

  return {
    daysInMonth, ...c, lateCuts, adjustDays, paidDays, lopDays,
    gross, earned, basic, hra, special, pf, pt, tds, net,
    inProgress: c.upcoming > 0,
  };
}
