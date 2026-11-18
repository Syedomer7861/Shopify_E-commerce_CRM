"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { DEFAULT_POLICY, isWeeklyOff, type AttendancePolicy } from "@/lib/attendance-engine";

/**
 * Excel-style day-by-day sheet: one row per employee per day of the month with
 * in/out time, hours, status and remarks. Reads the same computed attendance
 * the register uses (manual > biometric > CRM log), so the two always agree.
 */

interface Holiday { date: string; name: string }
interface Props { employees: any[]; attendanceLogs: any[]; holidays: Holiday[]; policy?: AttendancePolicy }

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_TEXT: Record<string, string> = {
  Present: "text-[#3fa877]", Late: "text-[#d99a1c]", "Half Day": "text-amber-600",
  Absent: "text-rose-500", Leave: "text-[#6f9bdd]", Holiday: "text-[#6f9bdd]",
};

const pad = (n: number) => String(n).padStart(2, "0");
const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";
const fmtHm = (mins: number) => (mins > 0 ? `${Math.floor(mins / 60)}:${pad(mins % 60)}` : "");

interface Row {
  date: string; day: string; name: string; code: string;
  inTime: string; outTime: string; hours: string; status: string;
  lateBy: string; punches: number | ""; remarks: string;
}

export function PunchSheet({ employees, attendanceLogs, holidays, policy = DEFAULT_POLICY }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [who, setWho] = useState("all");

  const prev = () => (month === 0 ? (setMonth(11), setYear((y) => y - 1)) : setMonth((m) => m - 1));
  const next = () => (month === 11 ? (setMonth(0), setYear((y) => y + 1)) : setMonth((m) => m + 1));

  const rows = useMemo<Row[]>(() => {
    const prefix = `${year}-${pad(month + 1)}-`;
    const byKey = new Map<string, any>();
    for (const l of attendanceLogs) if (typeof l.date === "string" && l.date.startsWith(prefix)) byKey.set(`${l.agent_id}::${l.date}`, l);
    const holidayByDate = new Map(holidays.map((h) => [h.date, h.name]));
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list = who === "all" ? employees : employees.filter((e) => e.id === who);
    const out: Row[] = [];
    for (const emp of list) {
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${prefix}${pad(d)}`;
        if (date > today) break;
        const wd = new Date(year, month, d).getDay();
        const log = byKey.get(`${emp.id}::${date}`);
        const remarks: string[] = [];
        if (log?.missing_out) remarks.push("Missed out-punch");
        if (log && !log.is_auto) remarks.push("Manual entry");
        if (log?.is_auto && log.source !== "biometric") remarks.push("From CRM login");
        const hol = holidayByDate.get(date);
        if (hol) remarks.push(hol);
        const off = isWeeklyOff(date, policy);
        if (off) remarks.push(log ? "Worked on weekly off" : "Weekly off");
        const late = log?.late_by_minutes ?? 0;
        out.push({
          date: `${pad(d)}-${pad(month + 1)}-${year}`,
          day: WEEKDAY[wd],
          name: emp.name ?? "",
          code: emp.biometric_code ?? "",
          inTime: fmtTime(log?.clock_in),
          outTime: fmtTime(log?.clock_out),
          hours: fmtHm(log?.productive_minutes ?? 0),
          status: log?.status ?? (hol ? "Holiday" : off ? "" : "No punch"),
          lateBy: late > 0 ? `${late} min` : "",
          punches: log?.punch_count ?? "",
          remarks: remarks.join("; "),
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, attendanceLogs, holidays, policy, month, year, who]);

  const totals = useMemo(() => {
    const mins = rows.reduce((s, r) => {
      const [h, m] = r.hours ? r.hours.split(":").map(Number) : [0, 0];
      return s + h * 60 + m;
    }, 0);
    return { days: rows.filter((r) => r.inTime).length, hours: fmtHm(mins) || "0:00" };
  }, [rows]);

  const monthName = new Date(year, month).toLocaleString("en-IN", { month: "long" });
  const HEAD = ["Date", "Day", "Employee", "Device Code", "In Time", "Out Time", "Total Hours", "Status", "Late By", "Punches", "Remarks"];

  const download = async () => {
    try {
      const { utils, writeFile } = await import("@/lib/sheets");
      const sheet = utils.aoa_to_sheet([
        HEAD,
        ...rows.map((r) => [r.date, r.day, r.name, r.code, r.inTime, r.outTime, r.hours, r.status, r.lateBy, r.punches, r.remarks]),
      ]);
      sheet["!cols"] = [12, 6, 22, 12, 10, 10, 11, 10, 9, 9, 30].map((wch) => ({ wch }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, sheet, `${monthName} ${year}`);
      const whoName = who === "all" ? "All" : (employees.find((e) => e.id === who)?.name ?? "Employee").replace(/[^\w]+/g, "_");
      await writeFile(wb, `Attendance_${monthName}_${year}_${whoName}.xlsx`);
    } catch (err: any) {
      toast.error(err?.message || "Could not create the Excel file");
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 justify-between px-4 sm:px-6 py-4 border-b border-[#ebece6] bg-[#fcfbf8]">
        <div className="flex items-center gap-2">
          <button onClick={prev} aria-label="Previous month" className="p-1.5 rounded-lg hover:bg-[#e6e7e0]"><ChevronLeft className="w-4 h-4" /></button>
          <h3 className="text-xs sm:text-sm font-bold text-[#1c1c1c] uppercase tracking-wider min-w-[130px] text-center">{monthName} {year}</h3>
          <button onClick={next} aria-label="Next month" className="p-1.5 rounded-lg hover:bg-[#e6e7e0]"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Employee"
            className="text-xs font-bold border border-[#ebece6] rounded-lg px-3 py-1.5 bg-white">
            <option value="all">All employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <span className="text-[10px] font-bold text-[#6b6b67]">{totals.days} days · {totals.hours} hrs</span>
          <button onClick={download} disabled={rows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#1c1c1c] text-white disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> Download Excel
          </button>
        </div>
      </div>

      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#f0f0ec]">
              {HEAD.map((h) => (
                <th key={h} className="px-3 py-2 text-[10px] font-bold text-[#6b6b67] uppercase tracking-wider border border-[#e2e3dc] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${r.date}-${i}`} className={cn(r.remarks.includes("Weekly off") ? "bg-rose-50/50" : i % 2 ? "bg-[#fcfbf8]" : "bg-white")}>
                <td className="px-3 py-1.5 border border-[#ebece6] whitespace-nowrap tabular-nums">{r.date}</td>
                <td className="px-3 py-1.5 border border-[#ebece6]">{r.day}</td>
                <td className="px-3 py-1.5 border border-[#ebece6] font-bold whitespace-nowrap">{r.name}</td>
                <td className="px-3 py-1.5 border border-[#ebece6] text-[#6b6b67]">{r.code}</td>
                <td className="px-3 py-1.5 border border-[#ebece6] tabular-nums">{r.inTime}</td>
                <td className="px-3 py-1.5 border border-[#ebece6] tabular-nums">{r.outTime}</td>
                <td className="px-3 py-1.5 border border-[#ebece6] tabular-nums font-bold">{r.hours}</td>
                <td className={cn("px-3 py-1.5 border border-[#ebece6] font-bold whitespace-nowrap", STATUS_TEXT[r.status] ?? "text-[#9a9a94]")}>{r.status}</td>
                <td className="px-3 py-1.5 border border-[#ebece6] text-[#d99a1c]">{r.lateBy}</td>
                <td className="px-3 py-1.5 border border-[#ebece6] text-center">{r.punches}</td>
                <td className={cn("px-3 py-1.5 border border-[#ebece6] whitespace-nowrap", r.remarks.includes("Missed") ? "text-rose-500 font-bold" : "text-[#6b6b67]")}>{r.remarks}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={HEAD.length} className="px-4 py-10 text-center text-[#9a9a94] font-bold">No days to show for this month.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
