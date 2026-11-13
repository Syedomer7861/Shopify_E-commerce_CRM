"use client";
import { useState, useEffect, useMemo } from "react";
import { Calendar, Clock, Plus, Sun, Moon, Sunset, CheckCircle, X, ChevronLeft, ChevronRight, Zap, BarChart3, Timer, Coffee, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";
import { isDemoMode } from "@/lib/demo";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";

const STATUS_OPTS = ["Present", "Absent", "Half Day", "Late", "Leave", "Holiday"] as const;
type AttStatus = typeof STATUS_OPTS[number];
const STATUS_COLOR: Record<AttStatus, string> = {
  Present: "bg-emerald-500 text-white",
  Absent: "bg-rose-500 text-white",
  "Half Day": "bg-amber-400 text-white",
  Late: "bg-orange-400 text-white",
  Leave: "bg-purple-400 text-white",
  Holiday: "bg-sky-400 text-white",
};
const STATUS_SHORT: Record<AttStatus, string> = {
  Present: "P", Absent: "A", "Half Day": "HD", Late: "L", Leave: "LV", Holiday: "H"
};

type ShiftType = "Morning" | "Afternoon" | "Night" | "Off";
const SHIFT_COLORS: Record<ShiftType, string> = {
  Morning: "bg-amber-50 text-amber-700 border-amber-200",
  Afternoon: "bg-sky-50 text-sky-700 border-sky-200",
  Night: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Off: "bg-gray-50 text-gray-400 border-gray-200",
};
// Mirrors SHIFT_START_MINUTES in src/lib/attendance-engine.ts - shown here
// so HR can see what "Late" is being measured against.
const SHIFT_START_LABEL: Record<ShiftType, string> = {
  Morning: "9:00 AM", Afternoon: "1:00 PM", Night: "9:00 PM", Off: "—",
};

interface Holiday { id?: string; date: string; name: string; type: "National" | "Optional" }

interface AttendanceCell {
  status: AttStatus;
  isAuto: boolean;
  clockIn: string | null;
  clockOut: string | null;
  productiveMinutes: number;
  breakMinutes: number;
}

interface Props { members: any[]; employees: any[]; attendanceLogs: any[]; holidays: Holiday[]; onRefresh: () => void; }

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
function fmtHours(mins: number) {
  if (!mins) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function AttendanceRegister({ members, employees, attendanceLogs, holidays, onRefresh }: Props) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"register" | "shifts" | "holidays" | "analytics">("register");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Record<number, AttendanceCell>>>({});
  const [shiftSaving, setShiftSaving] = useState<string | null>(null);
  const [newHoliday, setNewHoliday] = useState({ date: "", name: "", type: "National" as "National" | "Optional" });
  const [savingHoliday, setSavingHoliday] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const list = employees.map(m => ({ id: m.id, name: m.name }));
    setAgents(list);

    // Map DB logs to local state grid, keyed by name (matches the table's
    // row key) but carrying the full computed record, not just a letter.
    const grid: Record<string, Record<number, AttendanceCell>> = {};
    attendanceLogs.forEach(log => {
      const logDate = new Date(log.date);
      if (logDate.getMonth() === month && logDate.getFullYear() === year) {
        const emp = employees.find(e => e.id === log.agent_id);
        if (emp) {
          if (!grid[emp.name]) grid[emp.name] = {};
          grid[emp.name][logDate.getDate()] = {
            status: log.status as AttStatus,
            isAuto: !!log.is_auto,
            clockIn: log.clock_in ?? null,
            clockOut: log.clock_out ?? null,
            productiveMinutes: log.productive_minutes ?? 0,
            breakMinutes: log.break_minutes ?? 0,
          };
        }
      }
    });
    setAttendance(grid);
  }, [employees, attendanceLogs, month, year]);

  const setStatus = async (agentName: string, day: number, status: AttStatus) => {
    const emp = employees.find(e => e.name === agentName);
    if (!emp) return;

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    if (isDemoMode()) {
      toast.success(`Demo: ${agentName} marked ${status} on ${dateStr} (local only)`);
      return;
    }

    try {
      const res = await fetch("/api/hr/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "attendance",
          data: {
            agent_id: emp.id,
            date: dateStr,
            status: status
          }
        })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save attendance");
      }
      onRefresh();
    } catch (err: any) {
      console.error("Attendance Save Error:", err.message);
      toast.error(err.message);
    }
  };

  const setShift = async (agentId: string, agentName: string, shift: ShiftType) => {
    if (isDemoMode()) {
      toast.success(`Demo: ${agentName} moved to ${shift} shift (local only)`);
      return;
    }
    setShiftSaving(agentId);
    try {
      const res = await fetch("/api/hr/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "shift", data: { agent_id: agentId, shift_type: shift } }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save shift");
      }
      toast.success(`${agentName} moved to ${shift} shift`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setShiftSaving(null);
    }
  };

  const addHoliday = async () => {
    if (!newHoliday.date || !newHoliday.name) return;

    if (isDemoMode()) {
      toast.success("Demo: holiday added (local only)");
      setNewHoliday({ date: "", name: "", type: "National" });
      return;
    }
    setSavingHoliday(true);
    try {
      const res = await fetch("/api/hr/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "holiday",
          data: { date: newHoliday.date, name: newHoliday.name, holidayType: newHoliday.type },
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to add holiday");
      }
      setNewHoliday({ date: "", name: "", type: "National" });
      toast.success("Holiday added");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingHoliday(false);
    }
  };

  const deleteHoliday = async (id: string | undefined) => {
    if (!id) return;

    if (isDemoMode()) {
      toast.success("Demo: holiday removed (local only)");
      return;
    }
    try {
      const res = await fetch("/api/hr/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "holiday", action: "delete", data: { id } }),
      });
      if (!res.ok) throw new Error("Failed to remove holiday");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthName = mounted ? new Date(year, month).toLocaleString("default", { month: "long" }) : "---";

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const getCell = (agent: string, day: number): AttendanceCell | undefined => attendance[agent]?.[day];

  const countFor = (agent: string, status: AttStatus) =>
    Object.values(attendance[agent] || {}).filter(v => v.status === status).length;

  const isHoliday = (day: number) =>
    holidays.some(h => h.date === `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);

  // ── Analytics, derived from the same corrected monthly grid ──────────────
  const analytics = useMemo(() => {
    const perAgent = agents.map(a => {
      const cells = Object.values(attendance[a.name] || {});
      const present = cells.filter(c => c.status === "Present").length;
      const late = cells.filter(c => c.status === "Late").length;
      const half = cells.filter(c => c.status === "Half Day").length;
      const absent = cells.filter(c => c.status === "Absent").length;
      const totalMarked = cells.length;
      const workedDays = present + late + half;
      const attendanceRate = totalMarked > 0 ? Math.round(((workedDays) / totalMarked) * 100) : 0;
      const punctualityRate = workedDays > 0 ? Math.round(((present) / workedDays) * 100) : 0;
      const avgProductiveMins = cells.length
        ? Math.round(cells.reduce((sum, c) => sum + c.productiveMinutes, 0) / cells.length)
        : 0;
      const totalBreakMins = cells.reduce((sum, c) => sum + c.breakMinutes, 0);
      return { name: a.name, present, late, half, absent, attendanceRate, punctualityRate, avgProductiveMins, totalBreakMins };
    });

    // Daily average productive hours across the whole team, for the trend line.
    const byDay: Record<number, { total: number; count: number }> = {};
    for (const agentGrid of Object.values(attendance)) {
      for (const [dayStr, cell] of Object.entries(agentGrid)) {
        const d = Number(dayStr);
        if (!byDay[d]) byDay[d] = { total: 0, count: 0 };
        byDay[d].total += cell.productiveMinutes;
        byDay[d].count += 1;
      }
    }
    const trend = days.map(d => ({
      day: d,
      avgHours: byDay[d] ? Math.round((byDay[d].total / byDay[d].count / 60) * 10) / 10 : 0,
    }));

    const teamAttendanceRate = perAgent.length
      ? Math.round(perAgent.reduce((s, a) => s + a.attendanceRate, 0) / perAgent.length)
      : 0;
    const teamPunctualityRate = perAgent.length
      ? Math.round(perAgent.reduce((s, a) => s + a.punctualityRate, 0) / perAgent.length)
      : 0;
    const totalAbsences = perAgent.reduce((s, a) => s + a.absent, 0);
    const totalBreakHours = Math.round(perAgent.reduce((s, a) => s + a.totalBreakMins, 0) / 60);

    return { perAgent, trend, teamAttendanceRate, teamPunctualityRate, totalAbsences, totalBreakHours };
  }, [agents, attendance, days]);

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl w-full sm:w-fit">
        {(["register", "shifts", "holidays", "analytics"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-1.5 text-xs font-bold rounded-lg capitalize transition-all",
              tab === t ? "bg-[#1c1c1c] text-white" : "text-gray-500 hover:text-[#1c1c1c]")}>
            {t === "register" ? "Monthly Register" : t === "shifts" ? "Shift Assignment" : t === "holidays" ? "Holiday Calendar" : "Analytics"}
          </button>
        ))}
      </div>

      {/* ── Monthly Attendance Register ── */}
      {tab === "register" && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 bg-[#fcfbf8]">
            <button onClick={prevMonth} aria-label="Previous month" className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <h3 className="text-xs sm:text-sm font-black text-[#1c1c1c] uppercase tracking-widest">{monthName} {year}</h3>
            <button onClick={nextMonth} aria-label="Next month" className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-50">
            {STATUS_OPTS.map(s => (
              <span key={s} className={cn("text-[9px] font-black px-2 py-0.5 rounded-full", STATUS_COLOR[s])}>
                {STATUS_SHORT[s]} — {s}
              </span>
            ))}
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex items-center gap-1 ml-2">
              <Zap className="w-2.5 h-2.5" /> Auto-detected from clock-in
            </span>
            <span className="text-[9px] text-gray-400 font-bold">· Click a cell to override manually</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#fcfbf8]">
                  <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky left-0 bg-[#fcfbf8] z-10 min-w-[140px]">Team Member</th>
                  {days.map(d => (
                    <th key={d} className={cn("px-1 py-3 text-center text-[9px] font-black uppercase tracking-widest min-w-[36px]",
                      isHoliday(d) ? "text-sky-500" : "text-gray-400")}>
                      {d}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {agents.map(agent => (
                  <tr key={agent.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 sticky left-0 bg-white z-10">
                      <div className="text-xs font-black text-[#1c1c1c]">{agent.name}</div>
                    </td>
                    {days.map(d => {
                      const cell = getCell(agent.name, d);
                      const hol = isHoliday(d);
                      const statusCycle = (current: AttStatus | undefined): AttStatus => {
                        const idx = current ? STATUS_OPTS.indexOf(current) : -1;
                        return STATUS_OPTS[(idx + 1) % STATUS_OPTS.length];
                      };
                      const title = cell
                        ? `${cell.status}${cell.isAuto ? " (auto-detected)" : " (manual)"}\nIn: ${fmtTime(cell.clockIn)}  Out: ${fmtTime(cell.clockOut)}\nWorked: ${fmtHours(cell.productiveMinutes)}  Break: ${fmtHours(cell.breakMinutes)}`
                        : (hol ? "Holiday" : "No record — click to set");
                      return (
                        <td key={d} className="px-0.5 py-2 text-center">
                          <button
                            onClick={() => setStatus(agent.name, d, statusCycle(cell?.status))}
                            className={cn("relative w-7 h-7 rounded-lg text-[9px] font-black transition-all hover:scale-110",
                              hol && !cell ? "bg-sky-50 text-sky-400" :
                              cell ? STATUS_COLOR[cell.status] : "bg-gray-100 text-gray-300 hover:bg-gray-200"
                            )}
                            title={title}
                          >
                            {cell ? STATUS_SHORT[cell.status] : hol ? "H" : "·"}
                            {cell?.isAuto && (
                              <Zap className="w-2 h-2 absolute -top-0.5 -right-0.5 text-white drop-shadow" fill="currentColor" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3">
                      <div className="flex gap-2 text-[9px] font-black">
                        <span className="text-emerald-600">P:{countFor(agent.name, "Present")}</span>
                        <span className="text-orange-500">L:{countFor(agent.name, "Late")}</span>
                        <span className="text-rose-500">A:{countFor(agent.name, "Absent")}</span>
                        <span className="text-purple-500">LV:{countFor(agent.name, "Leave")}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {agents.length === 0 && (
                  <tr><td colSpan={days.length + 2} className="px-4 py-10 text-center text-xs text-gray-400 font-bold">No team members found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Shift Assignment ── */}
      {tab === "shifts" && (
        <div className="card p-6">
          <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-2">Weekly Shift Assignment</h3>
          <p className="text-xs text-gray-400 mb-6">
            Assign shift rotations per agent. Saved immediately and used to flag late clock-ins in the register above.
          </p>
          <div className="space-y-3">
            {employees.map(emp => {
              const currentShift = (emp.shift_type as ShiftType) || "Morning";
              return (
               <div key={emp.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-gray-50 rounded-xl border border-transparent hover:border-gray-200 transition-all gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1c1c1c] flex items-center justify-center text-white text-xs font-black">
                    {emp.name?.split(" ").map((n: string) => n[0]).join("")}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#1c1c1c]">{emp.name}</div>
                    <div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Starts {SHIFT_START_LABEL[currentShift]}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  {(["Morning", "Afternoon", "Night", "Off"] as ShiftType[]).map(s => (
                    <button key={s} disabled={shiftSaving === emp.id} onClick={() => setShift(emp.id, emp.name, s)}
                      className={cn("px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all flex items-center gap-1 disabled:opacity-50",
                        currentShift === s ? SHIFT_COLORS[s] + " scale-105" : "border-gray-200 text-gray-400 hover:border-gray-300")}>
                      {s === "Morning" && <Sun className="w-3 h-3" />}
                      {s === "Afternoon" && <Sunset className="w-3 h-3" />}
                      {s === "Night" && <Moon className="w-3 h-3" />}
                      {s === "Off" && <X className="w-3 h-3" />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              );
            })}
            {employees.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No team members found.</p>}
          </div>
          <div className="mt-6 p-4 bg-[#1c1c1c] rounded-xl text-white">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-3">Current Shift Summary</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["Morning", "Afternoon", "Night", "Off"] as ShiftType[]).map(s => (
                <div key={s} className="text-center">
                  <div className="text-2xl font-black">{employees.filter(e => (e.shift_type || "Morning") === s).length}</div>
                  <div className="text-[9px] font-bold text-white/50 uppercase">{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Holiday Calendar ── */}
      {tab === "holidays" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-5 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Holiday List
            </h3>
            <div className="space-y-3">
              {holidays.map((h) => (
                <div key={h.id || h.date} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <div className="text-xs font-black text-[#1c1c1c]">{h.name}</div>
                    <div className="text-[10px] text-gray-400">{mounted ? new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "---"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full", h.type === "National" ? "bg-[#1c1c1c] text-white" : "bg-sky-100 text-sky-700")}>{h.type}</span>
                    <button aria-label="Remove" onClick={() => deleteHoliday(h.id)} className="text-rose-400 hover:text-rose-600 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {holidays.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No holidays added yet.</p>}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-5 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Holiday
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Holiday Date</label>
                <input type="date" className="input w-full text-sm" value={newHoliday.date} onChange={e => setNewHoliday(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Holiday Name</label>
                <input className="input w-full text-sm" placeholder="e.g., Diwali" value={newHoliday.name} onChange={e => setNewHoliday(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Type</label>
                <div className="flex gap-2">
                  {(["National", "Optional"] as const).map(t => (
                    <button key={t} onClick={() => setNewHoliday(p => ({ ...p, type: t }))}
                      className={cn("flex-1 py-2 text-xs font-bold rounded-lg border transition-all",
                        newHoliday.type === t ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "border-gray-200 text-gray-500")}>{t}</button>
                  ))}
                </div>
              </div>
              <button onClick={addHoliday} disabled={savingHoliday} className="btn-primary w-full py-2.5 text-xs gap-2 disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" /> {savingHoliday ? "Saving..." : "Add to Calendar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Analytics ── */}
      {tab === "analytics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Team Attendance Rate", value: `${analytics.teamAttendanceRate}%`, icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
              { label: "Team Punctuality", value: `${analytics.teamPunctualityRate}%`, icon: Timer, color: "text-sky-600 bg-sky-50" },
              { label: "Total Absences", value: analytics.totalAbsences, icon: X, color: "text-rose-600 bg-rose-50" },
              { label: "Total Break Hours", value: `${analytics.totalBreakHours}h`, icon: Coffee, color: "text-amber-600 bg-amber-50" },
            ].map((k, i) => (
              <div key={i} className="card p-5">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", k.color)}>
                  <k.icon className="w-4.5 h-4.5" />
                </div>
                <div className="text-2xl font-black text-[#1c1c1c] tracking-tight">{k.value}</div>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{k.label}</div>
              </div>
            ))}
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-1 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Attendance Rate by Agent
            </h3>
            <p className="text-[10px] text-gray-400 mb-6">Present + Late + Half Day, as a share of every day with a record this month.</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.perAgent} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="attendanceRate" name="Attendance Rate" fill="#10b981" radius={[8, 8, 0, 0]} barSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Average Hours Worked, Per Day
            </h3>
            <p className="text-[10px] text-gray-400 mb-6">Team-wide average productive hours per team member, across the month.</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.trend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="h" />
                  <Tooltip cursor={{ stroke: "#e2e8f0" }} />
                  <Line type="monotone" dataKey="avgHours" name="Avg Hours" stroke="#1c1c1c" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest">Per-Agent Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#fcfbf8]">
                    <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Agent</th>
                    <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Present</th>
                    <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Late</th>
                    <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Half Day</th>
                    <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Absent</th>
                    <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Avg Hrs/Day</th>
                    <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Punctuality</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {analytics.perAgent.map(a => (
                    <tr key={a.name} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-xs font-black text-[#1c1c1c]">{a.name}</td>
                      <td className="px-4 py-3 text-xs text-center font-bold text-emerald-600">{a.present}</td>
                      <td className="px-4 py-3 text-xs text-center font-bold text-orange-500">{a.late}</td>
                      <td className="px-4 py-3 text-xs text-center font-bold text-amber-500">{a.half}</td>
                      <td className="px-4 py-3 text-xs text-center font-bold text-rose-500">{a.absent}</td>
                      <td className="px-4 py-3 text-xs text-center font-bold text-[#1c1c1c]">{fmtHours(a.avgProductiveMins)}</td>
                      <td className="px-4 py-3 text-xs text-center font-bold text-sky-600">{a.punctualityRate}%</td>
                    </tr>
                  ))}
                  {analytics.perAgent.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-400 font-bold">No attendance data for this month yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
