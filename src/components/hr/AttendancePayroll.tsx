"use client";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle, ChevronLeft, ChevronRight, Download, Lock, Info } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { isDemoMode } from "@/lib/demo";
import { computeMonthPay, type PayResult } from "@/lib/attendance-pay";
import type { AttendancePolicy } from "@/lib/attendance-engine";

/**
 * Monthly payroll from attendance. Live figures come from the register
 * (paid days / days in month); marking a slip paid freezes its figures in
 * payroll_runs so later attendance edits don't change a paid slip.
 */

interface Props {
  employees: any[];
  attendance: any[];
  leaves: any[];
  holidays: { date: string }[];
  policy?: AttendancePolicy;
  payrollRuns: any[];
  onRefresh: () => void;
}

const FMT = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function post(body: unknown) {
  const res = await fetch("/api/hr/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Request failed");
}

export default function AttendancePayroll({ employees, attendance, leaves, holidays, policy, payrollRuns, onRefresh }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const now = new Date();
  const months = Array.from({ length: 3 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; });
  // Default to last month in the first week (payroll is usually run then), else this month.
  const [month, setMonth] = useState(now.getDate() <= 7 ? months[1] : months[0]);
  const [adjust, setAdjust] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const idx = months.indexOf(month);
  const monthName = mounted ? new Date(`${month}-01T00:00:00`).toLocaleString("en-IN", { month: "long", year: "numeric" }) : month;

  const runByAgent = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of payrollRuns) if (r.month === month) m.set(r.agent_id, r);
    return m;
  }, [payrollRuns, month]);

  const rows = useMemo(() => {
    const today = ymd(new Date());
    const holidayDates = holidays.map((h) => h.date).filter((d) => d?.startsWith(month));
    return employees.map((e) => {
      const run = runByAgent.get(e.id);
      const pay: PayResult = computeMonthPay({
        month, today,
        monthlySalary: Number(e.monthly_salary) || 0,
        joiningDate: e.joining_date,
        attendance: attendance.filter((a) => a.agent_id === e.id && typeof a.date === "string" && a.date.startsWith(month)),
        holidays: holidayDates,
        approvedLeaves: leaves.filter((l) => l.agent_id === e.id && l.status === "approved"),
        policy,
        adjustDays: Number(run?.adjust_days) || 0,
      });
      const paid = run?.status === "paid";
      const frozen = paid && run.net_pay != null;
      return {
        id: e.id as string,
        name: (e.name || e.email?.split("@")[0] || "—") as string,
        pay, paid, frozen,
        paidDays: frozen ? Number(run.paid_days) : pay.paidDays,
        lopDays: frozen ? Number(run.lop_days) : pay.lopDays,
        earned: frozen ? Number(run.gross_pay) : pay.earned,
        net: frozen ? Number(run.net_pay) : pay.net,
        b: frozen && run.breakdown ? run.breakdown : pay,
        changedSincePaid: frozen && Number(run.net_pay) !== pay.net,
      };
    });
  }, [employees, attendance, leaves, holidays, policy, month, runByAgent]);

  const inProgress = rows.some((r) => r.pay.inProgress);
  const snap = (p: PayResult) => ({
    paid_days: p.paidDays, lop_days: p.lopDays, gross_pay: p.earned, net_pay: p.net,
    breakdown: { basic: p.basic, hra: p.hra, special: p.special, pf: p.pf, pt: p.pt, tds: p.tds, gross: p.gross, daysInMonth: p.daysInMonth, lateCuts: p.lateCuts, adjustDays: p.adjustDays },
  });

  async function run(label: string, body: unknown) {
    if (isDemoMode()) return toast.success(`Demo: ${label} (local only)`);
    setBusy(true);
    try { await post(body); toast.success(label); onRefresh(); }
    catch (err: any) { toast.error(err.message || "Failed"); }
    finally { setBusy(false); }
  }

  const markAll = () => {
    const pending = rows.filter((r) => !r.paid && r.pay.gross > 0);
    if (!pending.length) return toast("Nothing pending with a salary set.");
    if (inProgress && !window.confirm(`${monthName} is not over yet - remaining days are counted as paid. Mark ${pending.length} slips paid anyway?`)) return;
    run(`${pending.length} payslips marked paid`, {
      type: "payroll", action: "mark_all_paid",
      data: { month, agent_ids: pending.map((r) => r.id), snapshots: Object.fromEntries(pending.map((r) => [r.id, snap(r.pay)])) },
    });
  };
  const toggle = (r: (typeof rows)[number]) => run(r.paid ? "Payslip moved back to pending" : "Payslip marked paid", {
    type: "payroll", action: r.paid ? "mark_pending" : "mark_paid",
    data: { agent_id: r.id, month, status: r.paid ? "pending" : "paid", snapshot: r.paid ? undefined : snap(r.pay) },
  });
  const saveAdjust = (r: (typeof rows)[number]) => {
    const raw = adjust[r.id];
    if (raw === undefined) return;
    const v = Math.round(Number(raw) * 2) / 2;
    setAdjust((a) => { const { [r.id]: _, ...rest } = a; return rest; });
    if (!Number.isFinite(v) || v < -31 || v > 31) return toast.error("Adjustment must be between -31 and 31 days.");
    if (v === r.pay.adjustDays) return;
    run("Paid-days adjustment saved", { type: "payroll", action: "adjust", data: { agent_id: r.id, month, adjust_days: v } });
  };

  async function download() {
    try {
      const { utils, writeFile } = await import("@/lib/sheets");
      const head = ["Employee", "Monthly Gross", "Days in Month", "Present", "Late", "Half Day", "Absent", "No Record", "Leave", "Holiday", "Weekly Off", "Late Cuts", "Adjust", "Paid Days", "LOP Days", "Earned Gross", "Basic", "HRA", "Special", "EPF", "Prof Tax", "TDS", "Net Pay", "Status"];
      const body = rows.map((r) => [r.name, r.pay.gross, r.pay.daysInMonth, r.pay.present, r.pay.late, r.pay.halfDay, r.pay.absent, r.pay.unmarked, r.pay.leave, r.pay.holiday, r.pay.weeklyOff, r.pay.lateCuts, r.pay.adjustDays, r.paidDays, r.lopDays, r.earned, r.b.basic, r.b.hra, r.b.special, r.b.pf, r.b.pt, r.b.tds, r.net, r.paid ? "Paid" : "Pending"]);
      const sheet = utils.aoa_to_sheet([head, ...body]);
      sheet["!cols"] = head.map((h, i) => ({ wch: i === 0 ? 22 : Math.max(8, h.length + 2) }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, sheet, monthName);
      await writeFile(wb, `Payroll_${month}.xlsx`);
    } catch (err: any) {
      toast.error(err?.message || "Could not create the Excel file");
    }
  }

  const total = rows.reduce((s, r) => s + r.net, 0);
  const paidCount = rows.filter((r) => r.paid).length;
  const totalLop = rows.reduce((s, r) => s + (r.pay.gross > 0 ? r.lopDays : 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-5 bg-[#1c1c1c] text-white col-span-2 md:col-span-1">
          <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1">Net payroll — {monthName}</p>
          <div className="text-2xl font-bold text-[#6fcb9d]">{FMT(total)}</div>
        </div>
        <div className="card p-5"><p className="text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider mb-1">Disbursed</p><div className="text-2xl font-bold text-[#1c1c1c]">{paidCount} / {rows.length}</div></div>
        <div className="card p-5"><p className="text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider mb-1">Pending</p><div className="text-2xl font-bold text-amber-500">{FMT(rows.filter((r) => !r.paid).reduce((s, r) => s + r.net, 0))}</div></div>
        <div className="card p-5"><p className="text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider mb-1">Loss of pay days</p><div className="text-2xl font-bold text-rose-500">{totalLop}</div></div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[#ebece6] bg-[#fcfbf8]">
          <div className="flex items-center gap-2">
            <button onClick={() => idx < months.length - 1 && setMonth(months[idx + 1])} disabled={idx >= months.length - 1} aria-label="Previous month" className="p-1.5 rounded-lg hover:bg-[#e6e7e0] disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            <h3 className="text-xs sm:text-sm font-bold text-[#1c1c1c] uppercase tracking-wider min-w-[150px] text-center">Payroll — {monthName}</h3>
            <button onClick={() => idx > 0 && setMonth(months[idx - 1])} disabled={idx <= 0} aria-label="Next month" className="p-1.5 rounded-lg hover:bg-[#e6e7e0] disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={download} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-[#ebece6] bg-white hover:border-[#d4d5cd]"><Download className="w-3.5 h-3.5" /> Excel</button>
            <button onClick={markAll} disabled={busy} className="btn-primary text-xs gap-2 px-4 py-2"><CheckCircle className="w-3.5 h-3.5" /> Mark all paid</button>
          </div>
        </div>
        {inProgress && (
          <div className="flex items-center gap-2 px-6 py-2 text-[11px] font-bold text-amber-700 bg-amber-50 border-b border-amber-100">
            <Info className="w-3.5 h-3.5" /> {monthName} is still running: days not over yet are counted as paid, so these are projections.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#f6f7f2]">
                {["Employee", "Monthly", "Paid days", "LOP", "Adjust ±", "Earned", "EPF(-)", "PT(-)", "TDS(-)", "Net pay", "Status", ""].map((h) => (
                  <th key={h} className="px-3 py-3 text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f6f7f2]">
              {rows.map((r) => {
                const p = r.pay;
                const detail = `Present ${p.present} · Late ${p.late} · Half day ${p.halfDay} · Absent ${p.absent} · No record ${p.unmarked}\nLeave ${p.leave} · Holiday ${p.holiday} · Weekly off ${p.weeklyOff}${p.upcoming ? ` · Not over yet ${p.upcoming}` : ""}${p.beforeJoining ? ` · Before joining ${p.beforeJoining}` : ""}${p.lateCuts ? `\nLate cuts: ${p.lateCuts} half day(s)` : ""}`;
                return (
                  <tr key={r.id} className="hover:bg-[#f6f7f2]/50">
                    <td className="px-3 py-3 text-xs font-bold text-[#1c1c1c] whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-3 text-xs text-[#55554f]">{p.gross ? FMT(p.gross) : <span className="text-[#c4c5bd]">Not set</span>}</td>
                    <td className="px-3 py-3 text-xs font-bold text-[#1c1c1c] cursor-help" title={detail}>{r.paidDays} <span className="text-[#9a9a94] font-normal">/ {p.daysInMonth}</span></td>
                    <td className={cn("px-3 py-3 text-xs font-bold", r.lopDays > 0 ? "text-rose-500" : "text-[#c4c5bd]")} title={detail}>{r.lopDays}</td>
                    <td className="px-3 py-3">
                      <input type="number" step={0.5} min={-31} max={31} aria-label={`Adjust paid days for ${r.name}`} disabled={r.paid || busy}
                        className="input h-7 w-16 text-xs disabled:opacity-50"
                        value={adjust[r.id] ?? String(p.adjustDays)}
                        onChange={(e) => setAdjust((a) => ({ ...a, [r.id]: e.target.value }))}
                        onBlur={() => saveAdjust(r)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                    </td>
                    <td className="px-3 py-3 text-xs text-[#55554f]" title={`Basic ${FMT(r.b.basic)} · HRA ${FMT(r.b.hra)} · Special ${FMT(r.b.special)}`}>{FMT(r.earned)}</td>
                    <td className="px-3 py-3 text-xs text-rose-500">{FMT(r.b.pf)}</td>
                    <td className="px-3 py-3 text-xs text-rose-500">{FMT(r.b.pt)}</td>
                    <td className="px-3 py-3 text-xs text-rose-500">{FMT(r.b.tds)}</td>
                    <td className="px-3 py-3 text-sm font-bold text-[#3fa877] whitespace-nowrap">
                      {FMT(r.net)}
                      {r.frozen && <Lock className="inline w-3 h-3 ml-1 text-[#9a9a94]" aria-label="Frozen when paid" />}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full", r.paid ? "bg-[#ecf8f1] text-[#2f8a5f]" : "bg-amber-50 text-amber-700")}>{r.paid ? "Paid" : "Pending"}</span>
                      {r.changedSincePaid && <div className="text-[9px] text-amber-600 font-bold mt-1" title={`Attendance now gives ${FMT(p.net)}`}>Attendance changed</div>}
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => toggle(r)} disabled={busy || (!r.paid && p.gross <= 0)}
                        className="text-[10px] font-bold text-[#6b6b67] hover:text-[#1c1c1c] disabled:opacity-30 whitespace-nowrap">
                        {r.paid ? "Undo" : "Mark paid"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={12} className="px-4 py-10 text-center text-xs text-[#9a9a94] font-bold">No employees.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="px-6 py-3 text-[10px] text-[#9a9a94] border-t border-[#f6f7f2]">
          Earned = monthly gross × paid days ÷ days in month. Paid days: Present/Late 1, Half Day ½, leave, holidays and weekly offs 1; Absent and working days with no record are loss of pay. Hover paid days for the breakdown. Paid slips keep the figures they were paid with (lock icon).
        </p>
      </div>
    </div>
  );
}
