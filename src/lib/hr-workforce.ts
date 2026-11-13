// Workforce figures for the HR overview, computed from data the page already
// loads (/api/hr/data and /api/team/status). Dates are compared as
// YYYY-MM-DD strings in local time, the same way attendance dates are stored.

export type Employee = { id: string; name?: string | null; is_active?: boolean | null; joining_date?: string | null; department?: string | null; designation?: string | null; monthly_salary?: number | null };
export type Leave = { id: string; agent_id: string; start_date: string; end_date: string; status: string; reason?: string | null; profile?: { name?: string | null } | null };
export type AttendanceRow = { agent_id: string; date: string; status: string };
export type Holiday = { id: string; date: string; name: string; type?: string | null };

const DAY = 86_400_000;
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const active = (e: Employee) => e.is_active !== false;

export function workforceKpis(employees: Employee[], leaves: Leave[], today: Date) {
  const t = ymd(today), d30 = ymd(addDays(today, -30)), d60 = ymd(addDays(today, -60));
  const staff = employees.filter(active);
  const joined = (from: string, to: string) => staff.filter(e => e.joining_date && e.joining_date > from && e.joining_date <= to).length;
  const onLeave = new Set(leaves.filter(l => l.status === "approved" && l.start_date <= t && l.end_date >= t).map(l => l.agent_id));
  return {
    total: staff.length,
    newHires: joined(d30, t),
    newHiresPrev: joined(d60, d30),
    onLeaveToday: onLeave.size,
    pendingLeaves: leaves.filter(l => l.status === "pending").length,
  };
}

/** Share of working records that were attended, per week (Monday start), oldest first.
 *  Present and Late count as 1, Half Day as 0.5; Holiday and Leave are not working days. */
export function attendanceByWeek(rows: AttendanceRow[], today: Date, weeks = 12) {
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(monday, (i - weeks + 1) * 7);
    const from = ymd(start), to = ymd(addDays(start, 6));
    let worked = 0, counted = 0;
    for (const r of rows) {
      if (r.date < from || r.date > to || r.status === "Holiday" || r.status === "Leave") continue;
      counted++;
      worked += r.status === "Present" || r.status === "Late" ? 1 : r.status === "Half Day" ? 0.5 : 0;
    }
    return { week: from, rate: counted ? Math.round((worked / counted) * 100) : null, records: counted };
  });
}

export function headcountByDepartment(employees: Employee[]) {
  const counts = new Map<string, number>();
  for (const e of employees.filter(active)) {
    const d = e.department?.trim() || "Unassigned";
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  return [...counts.entries()].map(([department, count]) => ({ department, count })).sort((a, b) => b.count - a.count);
}

/** Work anniversaries in the next `days` days (first anniversary onwards). */
export function upcomingAnniversaries(employees: Employee[], today: Date, days = 30) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out: { id: string; name: string; date: string; years: number; designation: string | null }[] = [];
  for (const e of employees.filter(active)) {
    if (!e.joining_date || !/^\d{4}-\d{2}-\d{2}/.test(e.joining_date)) continue;
    const [y, m, d] = e.joining_date.slice(0, 10).split("-").map(Number);
    let next = new Date(start.getFullYear(), m - 1, d);
    if (next < start) next = new Date(start.getFullYear() + 1, m - 1, d);
    const years = next.getFullYear() - y;
    if (years < 1 || (next.getTime() - start.getTime()) / DAY > days) continue;
    out.push({ id: e.id, name: e.name || "Employee", date: ymd(next), years, designation: e.designation || null });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function upcomingHolidays(holidays: Holiday[], today: Date, n = 4) {
  const t = ymd(today);
  return holidays.filter(h => h.date >= t).sort((a, b) => a.date.localeCompare(b.date)).slice(0, n);
}

/** This month's payroll: who is marked paid, and the monthly salary bill of active staff. */
export function payrollSummary(employees: Employee[], status: Record<string, { status: string }>) {
  const staff = employees.filter(active);
  const paid = staff.filter(e => status[e.id]?.status === "paid").length;
  const bill = staff.reduce((s, e) => s + (Number(e.monthly_salary) || 0), 0);
  const missingSalary = staff.filter(e => !Number(e.monthly_salary)).length;
  return { staff: staff.length, paid, pending: staff.length - paid, bill, missingSalary };
}
