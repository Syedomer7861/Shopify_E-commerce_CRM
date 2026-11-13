"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, CalendarDays, PartyPopper, UserPlus, Users, Wallet } from "lucide-react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  attendanceByWeek, headcountByDepartment, payrollSummary, upcomingAnniversaries, upcomingHolidays, workforceKpis,
  type AttendanceRow, type Employee, type Holiday, type Leave,
} from "@/lib/hr-workforce";

type Props = {
  employees: Employee[];
  leaves: Leave[];
  attendance: AttendanceRow[];
  holidays: Holiday[];
  payrollStatus: Record<string, { status: string }>;
  payrollMonth: string;
};

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const title = "text-xs font-black text-[#1c1c1c] uppercase tracking-widest";

function Kpi({ label, value, sub, icon: Icon, href }: { label: string; value: number | string; sub: string; icon: React.ElementType; href?: string }) {
  const body = (
    <div className="card p-5 h-full hover:border-[#1c1c1c]/20 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-gray-500">{label}</span>
        {href ? <ArrowUpRight className="w-3.5 h-3.5 text-gray-400" /> : <Icon className="w-3.5 h-3.5 text-gray-400" />}
      </div>
      <div className="text-3xl font-black text-[#1c1c1c] tabular-nums mt-3">{value}</div>
      <div className="text-[11px] text-gray-400 mt-1">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function WorkforceOverview({ employees, leaves, attendance, holidays, payrollStatus, payrollMonth }: Props) {
  const today = useMemo(() => new Date(), []);
  const v = useMemo(() => ({
    k: workforceKpis(employees, leaves, today),
    weeks: attendanceByWeek(attendance, today, 12),
    depts: headcountByDepartment(employees),
    anniversaries: upcomingAnniversaries(employees, today, 30).slice(0, 4),
    holidays: upcomingHolidays(holidays, today, 3),
    pay: payrollSummary(employees, payrollStatus),
    pending: leaves.filter(l => l.status === "pending").slice(0, 4),
  }), [employees, leaves, attendance, holidays, payrollStatus, today]);

  const hireDelta = v.k.newHires - v.k.newHiresPrev;
  const rated = v.weeks.filter(w => w.rate !== null);
  const latest = rated[rated.length - 1];
  const maxDept = Math.max(1, ...v.depts.map(d => d.count));
  const monthLabel = new Date(`${payrollMonth}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6 mb-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total employees" value={v.k.total} icon={Users} sub={`${v.k.newHires} joined in the last 30 days`} href="/hr?tab=employees" />
        <Kpi label="New hires" value={v.k.newHires} icon={UserPlus}
          sub={hireDelta === 0 ? "Same as the 30 days before" : `${hireDelta > 0 ? "+" : ""}${hireDelta} vs the 30 days before`} />
        <Kpi label="On leave today" value={v.k.onLeaveToday} icon={CalendarDays} sub="Approved leave covering today" />
        <Kpi label="Pending leave requests" value={v.k.pendingLeaves} icon={CalendarClock} sub="Waiting for a decision" href="/hr?tab=leaves" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="card p-6 xl:col-span-3">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className={title}>Attendance rate</h3>
              <p className="text-[11px] text-gray-400 mt-1">Weekly, last 12 weeks. Present and late count fully, half days as half; holidays and leave are left out.</p>
            </div>
            {latest && <div className="text-right"><div className="text-2xl font-black tabular-nums">{latest.rate}%</div><div className="text-[10px] text-gray-400">this week</div></div>}
          </div>
          {rated.length === 0 ? <p className="text-xs text-gray-400 py-10 text-center">No attendance recorded in the last 12 weeks.</p> : (
            <div className="flex items-end gap-2 h-40" role="img" aria-label="Weekly attendance rate">
              {v.weeks.map((w, i) => (
                <div key={w.week} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={w.rate === null ? `Week of ${short(w.week)}: no records` : `Week of ${short(w.week)}: ${w.rate}% (${w.records} records)`}>
                  {w.rate !== null && <span className="text-[9px] text-gray-400 tabular-nums">{w.rate}</span>}
                  <div className={cn("w-full rounded-md", w.rate === null ? "bg-gray-100 h-1" : i === v.weeks.length - 1 ? "bg-orange-500" : "bg-emerald-200")}
                    style={w.rate === null ? undefined : { height: `${Math.max(2, w.rate)}%` }} />
                  <span className="text-[9px] text-gray-400">{short(w.week)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6 xl:col-span-2">
          <h3 className={title}>Workforce by department</h3>
          <p className="text-[11px] text-gray-400 mt-1 mb-5">Active employees</p>
          {v.depts.length === 0 ? <p className="text-xs text-gray-400">No employees yet.</p> : (
            <div className="space-y-3">
              {v.depts.slice(0, 7).map(d => (
                <div key={d.department}>
                  <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-[#1c1c1c]">{d.department}</span><span className="tabular-nums text-gray-500">{d.count}</span></div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-[#1c1c1c]" style={{ width: `${(d.count / maxDept) * 100}%` }} /></div>
                </div>
              ))}
              {v.depts.length > 7 && <p className="text-[11px] text-gray-400">+{v.depts.length - 7} more departments</p>}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6">
          <h3 className={cn(title, "flex items-center gap-2 mb-4")}><PartyPopper className="w-4 h-4" /> Coming up</h3>
          {v.anniversaries.length === 0 && v.holidays.length === 0 && <p className="text-xs text-gray-400">No work anniversaries or holidays in the next 30 days.</p>}
          <div className="space-y-3">
            {v.anniversaries.map(a => (
              <div key={a.id} className="flex items-center gap-3">
                <Avatar name={a.name} size="sm" />
                <div className="flex-1 min-w-0"><div className="text-xs font-bold truncate">{a.name}</div><div className="text-[10px] text-gray-400">{a.years}-year work anniversary</div></div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-50">{short(a.date)}</span>
              </div>
            ))}
            {v.holidays.map(h => (
              <div key={h.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center"><CalendarDays className="w-3.5 h-3.5 text-orange-600" /></div>
                <div className="flex-1 min-w-0"><div className="text-xs font-bold truncate">{h.name}</div><div className="text-[10px] text-gray-400">{h.type || "Holiday"}</div></div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-50">{short(h.date)}</span>
              </div>
            ))}
          </div>
        </div>

        <Link href="/hr?tab=payroll" className="card p-6 hover:border-[#1c1c1c]/20 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className={cn(title, "flex items-center gap-2")}><Wallet className="w-4 h-4" /> Payroll status</h3>
            <ArrowUpRight className="w-3.5 h-3.5 text-gray-400" />
          </div>
          <div className="text-[11px] text-gray-400">{monthLabel}</div>
          <div className="text-2xl font-black tabular-nums mt-1">{rupees(v.pay.bill)}</div>
          <div className="text-[11px] text-gray-400">Monthly salaries of active staff</div>
          <div className="mt-5 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${v.pay.staff ? (v.pay.paid / v.pay.staff) * 100 : 0}%` }} />
          </div>
          <div className="flex justify-between text-xs mt-2">
            <span><b className="tabular-nums">{v.pay.paid}</b> paid</span>
            <span><b className="tabular-nums">{v.pay.pending}</b> pending</span>
          </div>
          {v.pay.missingSalary > 0 && <p className="text-[11px] text-amber-700 mt-3">{v.pay.missingSalary} active employee{v.pay.missingSalary === 1 ? " has" : "s have"} no salary set.</p>}
        </Link>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className={cn(title, "flex items-center gap-2")}><CalendarClock className="w-4 h-4" /> Pending leave</h3>
            <Link href="/hr?tab=leaves" className="text-[11px] font-bold text-gray-500 hover:text-[#1c1c1c]">Review all</Link>
          </div>
          {v.pending.length === 0 ? <p className="text-xs text-gray-400">No requests waiting.</p> : (
            <div className="space-y-3">
              {v.pending.map(l => (
                <div key={l.id} className="flex items-center gap-3">
                  <Avatar name={l.profile?.name || "Employee"} size="sm" />
                  <div className="flex-1 min-w-0"><div className="text-xs font-bold truncate">{l.profile?.name || "Employee"}</div><div className="text-[10px] text-gray-400 truncate">{l.reason || "No reason given"}</div></div>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">{short(l.start_date)}{l.end_date !== l.start_date ? ` – ${short(l.end_date)}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
