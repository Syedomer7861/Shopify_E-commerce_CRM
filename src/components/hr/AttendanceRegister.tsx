"use client";
import { useState, useEffect } from "react";
import { Calendar, Clock, Plus, Sun, Moon, Sunset, CheckCircle, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";


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

interface Holiday { date: string; name: string; type: "National" | "Optional" }

const HOLIDAYS: Holiday[] = [
  { date: "2025-01-26", name: "Republic Day", type: "National" },
  { date: "2025-04-14", name: "Ambedkar Jayanti", type: "National" },
  { date: "2025-08-15", name: "Independence Day", type: "National" },
  { date: "2025-10-02", name: "Gandhi Jayanti", type: "National" },
  { date: "2025-11-01", name: "Diwali (Laxmi Puja)", type: "Optional" },
  { date: "2025-12-25", name: "Christmas", type: "Optional" },
];

interface Props { members: any[]; employees: any[]; attendanceLogs: any[]; onRefresh: () => void; }

export default function AttendanceRegister({ members, employees, attendanceLogs, onRefresh }: Props) {
  const [tab, setTab] = useState<"register" | "shifts" | "holidays">("register");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [agents, setAgents] = useState<string[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Record<number, AttStatus>>>({});
  const [shifts, setShifts] = useState<Record<string, ShiftType>>({});
  const [newHoliday, setNewHoliday] = useState({ date: "", name: "", type: "National" as "National" | "Optional" });
  const [holidays, setHolidays] = useState<Holiday[]>(HOLIDAYS);

  useEffect(() => {
    // Map employees to agent names
    const names = employees.map(m => m.name);
    setAgents(names);

    // Map DB logs to local state grid
    const grid: Record<string, Record<number, AttStatus>> = {};
    attendanceLogs.forEach(log => {
      const logDate = new Date(log.date);
      if (logDate.getMonth() === month && logDate.getFullYear() === year) {
        const emp = employees.find(e => e.id === log.agent_id);
        if (emp) {
          if (!grid[emp.name]) grid[emp.name] = {};
          grid[emp.name][logDate.getDate()] = log.status as AttStatus;
        }
      }
    });
    setAttendance(grid);

    setShifts(prev => {
      const updated = { ...prev };
      names.forEach(n => { if (!updated[n]) updated[n] = "Morning"; });
      return updated;
    });
  }, [employees, attendanceLogs, month, year]);

  const setStatus = async (agentName: string, day: number, status: AttStatus) => {
    const emp = employees.find(e => e.name === agentName);
    if (!emp) return;

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
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

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthName = new Date(year, month).toLocaleString("default", { month: "long" });

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };



  const getStatus = (agent: string, day: number): AttStatus | undefined => {
    return attendance[agent]?.[day];
  };

  const countFor = (agent: string, status: AttStatus) =>
    Object.values(attendance[agent] || {}).filter(v => v === status).length;

  const isHoliday = (day: number) =>
    holidays.some(h => h.date === `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(["register", "shifts", "holidays"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-1.5 text-xs font-bold rounded-lg capitalize transition-all",
              tab === t ? "bg-[#1c1c1c] text-white" : "text-gray-500 hover:text-[#1c1c1c]")}>
            {t === "register" ? "Monthly Register" : t === "shifts" ? "Shift Assignment" : "Holiday Calendar"}
          </button>
        ))}
      </div>

      {/* ── Monthly Attendance Register ── */}
      {tab === "register" && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#fcfbf8]">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest">{monthName} {year}</h3>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-gray-50">
            {STATUS_OPTS.map(s => (
              <span key={s} className={cn("text-[9px] font-black px-2 py-0.5 rounded-full", STATUS_COLOR[s])}>
                {STATUS_SHORT[s]} — {s}
              </span>
            ))}
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
                  <tr key={agent} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 sticky left-0 bg-white z-10">
                      <div className="text-xs font-black text-[#1c1c1c]">{agent}</div>
                    </td>
                    {days.map(d => {
                      const s = getStatus(agent, d);
                      const hol = isHoliday(d);
                      const statusCycle = (current: AttStatus | undefined): AttStatus => {
                        const idx = current ? STATUS_OPTS.indexOf(current) : -1;
                        return STATUS_OPTS[(idx + 1) % STATUS_OPTS.length];
                      };
                      return (
                        <td key={d} className="px-0.5 py-2 text-center">
                          <button
                            onClick={() => setStatus(agent, d, statusCycle(s))}
                            className={cn("w-7 h-7 rounded-lg text-[9px] font-black transition-all hover:scale-110",
                              hol && !s ? "bg-sky-50 text-sky-400" :
                              s ? STATUS_COLOR[s] : "bg-gray-100 text-gray-300 hover:bg-gray-200"
                            )}
                            title={s || (hol ? "Holiday" : "Click to set")}
                          >
                            {s ? STATUS_SHORT[s] : hol ? "H" : "·"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3">
                      <div className="flex gap-2 text-[9px] font-black">
                        <span className="text-emerald-600">P:{countFor(agent, "Present")}</span>
                        <span className="text-rose-500">A:{countFor(agent, "Absent")}</span>
                        <span className="text-purple-500">L:{countFor(agent, "Leave")}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Shift Assignment ── */}
      {tab === "shifts" && (
        <div className="card p-6">
          <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-2">Weekly Shift Assignment</h3>
          <p className="text-xs text-gray-400 mb-6">Assign shift rotations per agent. Changes reflect immediately in attendance calculations.</p>
          <div className="space-y-3">
            {agents.map(agent => (
              <div key={agent} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-transparent hover:border-gray-200 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1c1c1c] flex items-center justify-center text-white text-xs font-black">
                    {agent.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div className="text-sm font-bold text-[#1c1c1c]">{agent}</div>
                </div>
                <div className="flex gap-2">
                  {(["Morning", "Afternoon", "Night", "Off"] as ShiftType[]).map(s => (
                    <button key={s} onClick={() => setShifts(prev => ({ ...prev, [agent]: s }))}
                      className={cn("px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all flex items-center gap-1",
                        shifts[agent] === s ? SHIFT_COLORS[s] + " scale-105" : "border-gray-200 text-gray-400 hover:border-gray-300")}>
                      {s === "Morning" && <Sun className="w-3 h-3" />}
                      {s === "Afternoon" && <Sunset className="w-3 h-3" />}
                      {s === "Night" && <Moon className="w-3 h-3" />}
                      {s === "Off" && <X className="w-3 h-3" />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-[#1c1c1c] rounded-xl text-white">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-3">Current Shift Summary</h4>
            <div className="grid grid-cols-4 gap-3">
              {(["Morning", "Afternoon", "Night", "Off"] as ShiftType[]).map(s => (
                <div key={s} className="text-center">
                  <div className="text-2xl font-black">{Object.values(shifts).filter(v => v === s).length}</div>
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
              <Calendar className="w-4 h-4" /> Holiday List {year}
            </h3>
            <div className="space-y-3">
              {holidays.map((h, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <div className="text-xs font-black text-[#1c1c1c]">{h.name}</div>
                    <div className="text-[10px] text-gray-400">{new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full", h.type === "National" ? "bg-[#1c1c1c] text-white" : "bg-sky-100 text-sky-700")}>{h.type}</span>
                    <button onClick={() => setHolidays(hols => hols.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
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
              <button onClick={() => {
                if (!newHoliday.date || !newHoliday.name) return;
                setHolidays(p => [...p, { ...newHoliday }].sort((a, b) => a.date.localeCompare(b.date)));
                setNewHoliday({ date: "", name: "", type: "National" });
              }} className="btn-primary w-full py-2.5 text-xs gap-2">
                <Plus className="w-3.5 h-3.5" /> Add to Calendar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
