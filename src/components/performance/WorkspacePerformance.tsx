"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { CheckCircle, ListTodo, Target, Clock, Activity, AlertTriangle, Flag, Timer, Gauge, Download } from "lucide-react";
import { StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";
import { isDemoMode } from "@/lib/demo";

interface Props {
  userId: string;
  name: string;
  range: { start: string; end: string };
}

interface WsData {
  summary: {
    tasksDone: number;
    tasksOpen: number;
    overdueNow: number;
    onTimeRate: number | null;
    hoursLogged: number;
    activityCount: number;
  };
  deltas: {
    tasksDone: number | null;
    hoursLogged: number;
    activityCount: number;
    onTimeRate: number | null;
  } | null;
  priorityMix: { urgent: number; high: number; normal: number; low: number };
  goals: { id: string; title: string; target: number; progress: number; period_start: string; period_end: string }[];
  delivery: {
    cycleTimeDays: number | null;
    estimatedMin: number;
    loggedMinOnDone: number;
    openEstimateMin: number;
  };
  reworkCount: number;
  activityByType: Record<string, number>;
  teamMedian: { tasksDone: number; hoursLogged: number } | null;
  bySpace: { space: string; done: number; open: number }[];
  daily: { date: string; minutes: number; tasksDone: number }[];
  recentActivity: { id: string; action: string; summary: string | null; created_at: string }[];
}

// StatCard trend from a current/previous pair. Higher = good for every metric
// here (more done, more hours logged, more on-time, more activity).
function trendProps(cur: number, prev: number | null | undefined) {
  if (prev == null) return {};
  const diff = Math.round((cur - prev) * 10) / 10;
  if (diff === 0) return { trend: "neutral" as const, trendValue: "0" };
  return { trend: diff > 0 ? ("up" as const) : ("down" as const), trendValue: `${diff > 0 ? "+" : ""}${diff}` };
}

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-amber-500",
  normal: "bg-blue-500",
  low: "bg-[#9c9a94]",
};

// hours "HH:MM:SS" -> "HH:MM"
const hm = (s?: string) => (s || "00:00:00").slice(0, 5);

const CAP_KEY = "mkt-workload-weekly-hours";
const h1 = (min: number) => Math.round((min / 60) * 10) / 10;

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function WorkspacePerformance({ userId, name, range }: Props) {
  const [data, setData] = useState<WsData | null>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    if (isDemoMode()) {
      setData({
        summary: { tasksDone: 37, tasksOpen: 9, overdueNow: 2, onTimeRate: 84, hoursLogged: 52.5, activityCount: 128 },
        deltas: { tasksDone: 29, hoursLogged: 47, activityCount: 110, onTimeRate: 79 },
        priorityMix: { urgent: 6, high: 14, normal: 13, low: 4 },
        delivery: { cycleTimeDays: 2.6, estimatedMin: 2400, loggedMinOnDone: 2760, openEstimateMin: 1800 },
        reworkCount: 3,
        activityByType: { mkt_task_status_changed: 54, mkt_task_updated: 61, mkt_task_created: 13 },
        teamMedian: { tasksDone: 24, hoursLogged: 41 },
        goals: [
          { id: "g1", title: "Ship 30 creatives", target: 30, progress: 22, period_start: "2026-08-01", period_end: "2026-08-31" },
          { id: "g2", title: "Campaign assets", target: 12, progress: 12, period_start: "2026-08-01", period_end: "2026-08-31" },
        ],
        bySpace: [
          { space: "Creative", done: 22, open: 4 },
          { space: "Campaigns", done: 11, open: 3 },
          { space: "Content", done: 4, open: 2 },
        ],
        daily: Array.from({ length: 10 }, (_, i) => ({
          date: new Date(Date.now() - (9 - i) * 86400000).toISOString().slice(0, 10),
          minutes: 240 + Math.round(Math.random() * 200),
          tasksDone: Math.round(Math.random() * 6),
        })),
        recentActivity: [
          { id: "1", action: "status", summary: 'Moved "Diwali hero banner" to Done', created_at: new Date().toISOString() },
          { id: "2", action: "comment", summary: "Commented on \"Landing page v3\"", created_at: new Date(Date.now() - 3600e3).toISOString() },
        ],
      });
      setAttendance([]);
      setLoading(false);
      return () => { alive = false; };
    }

    const q = `userId=${userId}&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
    Promise.all([
      fetch(`/api/marketing/performance?${q}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/admin/analytics/agents?agentId=${userId}&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`)
        .then((r) => r.json()).catch(() => null),
    ]).then(([ws, agents]) => {
      if (!alive) return;
      if (ws?.success) setData(ws);
      setAttendance(agents?.dailyLogs || []);
      setLoading(false);
    });

    return () => { alive = false; };
  }, [userId, range.start, range.end]);

  const chartData = useMemo(
    () => (data?.daily || []).map((d) => ({
      date: d.date.slice(5),
      Hours: Math.round((d.minutes / 60) * 10) / 10,
      Done: d.tasksDone,
    })),
    [data],
  );

  if (loading) return <div className="p-12 text-center text-gray-400 text-sm">Loading workspace performance…</div>;
  if (!data) return <div className="card p-12 text-center text-sm text-gray-400">No workspace data for {name} in this range.</div>;

  const s = data.summary;
  const d = data.deltas;
  const pm = data.priorityMix;
  const pmTotal = pm.urgent + pm.high + pm.normal + pm.low;
  const dl = data.delivery;

  let weeklyCap = 40;
  try {
    const r = typeof localStorage !== "undefined" && localStorage.getItem(CAP_KEY);
    if (r) weeklyCap = Math.max(1, Number(r)) || 40;
  } catch { /* ignore */ }

  const estH = h1(dl.estimatedMin);
  const logH = h1(dl.loggedMinOnDone);
  const openH = h1(dl.openEstimateMin);
  const capPct = weeklyCap > 0 ? Math.round((openH / weeklyCap) * 100) : 0;
  const estRatio = estH > 0 ? Math.round((logH / estH) * 100) : null;
  const tm = data.teamMedian;
  const vsMed = (cur: number, med?: number) =>
    med == null ? undefined : `you ${cur} · team median ${med}`;
  const prettyAction = (k: string) =>
    k.replace(/^mkt_task_/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const actEntries = Object.entries(data.activityByType).sort((a, b) => b[1] - a[1]);

  function exportCsv() {
    if (!data) return;
    downloadCsv(`workspace-performance-${name.replace(/[^a-z0-9]+/gi, "_")}.csv`, [
      ["Workspace Performance", name],
      ["Range", `${range.start.slice(0, 10)} to ${range.end.slice(0, 10)}`],
      [],
      ["Metric", "Value"],
      ["Tasks Done", s.tasksDone],
      ["Open Tasks", s.tasksOpen],
      ["Overdue Now", s.overdueNow],
      ["On-Time %", s.onTimeRate ?? "-"],
      ["Hours Logged", s.hoursLogged],
      ["Activity Events", s.activityCount],
      ["Avg Cycle Time (days)", dl.cycleTimeDays ?? "-"],
      ["Estimated Hours (done)", estH],
      ["Logged Hours (done)", logH],
      ["Open Estimate Hours", openH],
      ["Rework (moved back from done)", data.reworkCount],
      ["Team Median Tasks Done", tm?.tasksDone ?? "-"],
      ["Team Median Hours Logged", tm?.hoursLogged ?? "-"],
      [],
      ["Space", "Done", "Open"],
      ...data.bySpace.map((r) => [r.space, r.done, r.open]),
      [],
      ["Goal", "Progress", "Target"],
      ...data.goals.map((g) => [g.title, g.progress, g.target]),
      [],
      ["Date", "Hours", "Tasks Done"],
      ...data.daily.map((x) => [x.date, h1(x.minutes), x.tasksDone]),
      [],
      ["Attendance Date", "In", "Out", "Net"],
      ...attendance.map((a: any) => [a.date, a.clockIn || "", a.clockOut || "", hm(a.netHours)]),
    ]);
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex justify-end">
        <button onClick={exportCsv}
          className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest bg-[#1c1c1c] text-white flex items-center gap-1.5 hover:opacity-90 transition-all">
          <Download className="w-3 h-3" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        <StatCard label="Tasks Done" value={s.tasksDone} sub={vsMed(s.tasksDone, tm?.tasksDone) ?? (d ? "vs prev period" : name)} icon={<CheckCircle className="w-4 h-4" />} {...trendProps(s.tasksDone, d?.tasksDone)} />
        <StatCard label="Open Tasks" value={s.tasksOpen} sub="Currently assigned" icon={<ListTodo className="w-4 h-4" />} />
        <StatCard label="Overdue" value={s.overdueNow} sub="Open, past due date" accent={s.overdueNow > 0 ? "text-rose-600" : undefined} icon={<AlertTriangle className="w-4 h-4" />} />
        <StatCard label="On-Time" value={s.onTimeRate == null ? "—" : `${s.onTimeRate}%`} sub="Of tasks with a due date" icon={<Target className="w-4 h-4" />} {...(s.onTimeRate != null ? trendProps(s.onTimeRate, d?.onTimeRate ?? null) : {})} />
        <StatCard label="Hours Logged" value={`${s.hoursLogged}h`} sub={vsMed(s.hoursLogged, tm?.hoursLogged) ?? "Time entries in range"} icon={<Clock className="w-4 h-4" />} {...trendProps(s.hoursLogged, d?.hoursLogged)} />
        <StatCard label="Activity" value={s.activityCount} sub="Task events in range" icon={<Activity className="w-4 h-4" />} {...trendProps(s.activityCount, d?.activityCount)} />
      </div>

      {(data.goals.length > 0 || pmTotal > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-5">
            <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest mb-4">Personal Goals</h3>
            {data.goals.length === 0 ? (
              <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest py-8 text-center">No goals assigned</div>
            ) : (
              <div className="space-y-4">
                {data.goals.map((g) => {
                  const pct = g.target > 0 ? Math.min(100, Math.round((g.progress / g.target) * 100)) : 0;
                  return (
                    <div key={g.id}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-[#1c1c1c] truncate pr-3">{g.title}</span>
                        <span className="font-bold text-[#5f5f5d] tabular-nums shrink-0">{g.progress}/{g.target}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#eceae4] overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-emerald-500" : "bg-[#1c1c1c]")} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest mb-4 flex items-center gap-2">
              <Flag className="w-3.5 h-3.5" /> Completed by Priority
            </h3>
            {pmTotal === 0 ? (
              <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest py-8 text-center">Nothing completed in range</div>
            ) : (
              <div className="space-y-3">
                {(["urgent", "high", "normal", "low"] as const).map((k) => (
                  <div key={k} className="flex items-center gap-3 text-xs">
                    <span className="w-14 font-bold text-[#5f5f5d] uppercase text-[10px] tracking-widest">{k}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-[#eceae4] overflow-hidden">
                      <div className={cn("h-full rounded-full", PRIORITY_STYLE[k])} style={{ width: `${Math.round((pm[k] / pmTotal) * 100)}%` }} />
                    </div>
                    <span className="w-8 text-right font-bold text-[#1c1c1c] tabular-nums">{pm[k]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="card p-5">
          <div className="text-[10px] font-black text-[#5f5f5d]/50 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Timer className="w-3.5 h-3.5" /> Avg Cycle Time
          </div>
          <div className="text-2xl font-black text-[#1c1c1c] tabular-nums">{dl.cycleTimeDays == null ? "—" : `${dl.cycleTimeDays}d`}</div>
          <div className="text-[10px] text-gray-400 font-bold mt-1">Created → done, tasks in range</div>
        </div>

        <div className="card p-5">
          <div className="text-[10px] font-black text-[#5f5f5d]/50 uppercase tracking-widest mb-2">Estimate Accuracy</div>
          {estH === 0 ? (
            <div className="text-[11px] text-gray-400 font-bold py-3">No estimates on completed tasks</div>
          ) : (
            <>
              <div className="text-2xl font-black text-[#1c1c1c] tabular-nums">
                {estRatio}%
                <span className={cn("ml-2 text-[10px] font-black uppercase", estRatio != null && estRatio > 115 ? "text-rose-600" : estRatio != null && estRatio < 85 ? "text-amber-600" : "text-emerald-600")}>
                  {estRatio != null && estRatio > 115 ? "over" : estRatio != null && estRatio < 85 ? "under" : "on target"}
                </span>
              </div>
              <div className="text-[10px] text-gray-400 font-bold mt-1 tabular-nums">est {estH}h · logged {logH}h</div>
            </>
          )}
        </div>

        <div className="card p-5">
          <div className="text-[10px] font-black text-[#5f5f5d]/50 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5" /> Open Capacity
          </div>
          <div className="text-2xl font-black text-[#1c1c1c] tabular-nums">
            {openH}h <span className="text-[10px] text-gray-400 font-bold">/ {weeklyCap}h wk</span>
          </div>
          <div className="h-2 rounded-full bg-[#eceae4] overflow-hidden mt-2">
            <div className={cn("h-full rounded-full", capPct > 100 ? "bg-rose-500" : capPct > 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, capPct)}%` }} />
          </div>
        </div>

        <div className="card p-5">
          <div className="text-[10px] font-black text-[#5f5f5d]/50 uppercase tracking-widest mb-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" /> Rework
          </div>
          <div className={cn("text-2xl font-black tabular-nums", data.reworkCount > 0 ? "text-amber-600" : "text-[#1c1c1c]")}>{data.reworkCount}</div>
          <div className="text-[10px] text-gray-400 font-bold mt-1">Moved back out of a done column</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest mb-4">Daily Output</h3>
          <div className="h-[240px]">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[11px] text-gray-400 font-bold uppercase tracking-widest">No activity in range</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceae4" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fontWeight: 700, fill: "#5f5f5d" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: "#5f5f5d" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#1c1c1c", border: "none", borderRadius: 8, fontSize: 10 }} itemStyle={{ color: "#fcfbf8" }} labelStyle={{ color: "#fcfbf8" }} />
                  <Bar dataKey="Hours" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={14} />
                  <Bar dataKey="Done" fill="#10b981" radius={[4, 4, 0, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest mb-4">By Space</h3>
          {data.bySpace.length === 0 ? (
            <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest py-8 text-center">No tasks assigned</div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 text-[9px] font-black text-[#5f5f5d]/50 uppercase tracking-widest px-1 pb-1">
                <span>Space</span><span className="w-12 text-right">Done</span><span className="w-12 text-right">Open</span>
              </div>
              {data.bySpace.map((r) => (
                <div key={r.space} className="grid grid-cols-[1fr_auto_auto] gap-4 text-xs items-center px-1">
                  <span className="font-bold text-[#1c1c1c] truncate">{r.space}</span>
                  <span className="w-12 text-right font-bold text-emerald-600 tabular-nums">{r.done}</span>
                  <span className="w-12 text-right font-bold text-[#5f5f5d] tabular-nums">{r.open}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest mb-4">Attendance Ledger</h3>
          {attendance.length === 0 ? (
            <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest py-8 text-center">No attendance rows</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#eceae4] text-[9px] font-black text-[#5f5f5d]/50 uppercase tracking-widest">
                    <th className="py-2">Date</th><th className="py-2">In</th><th className="py-2">Out</th><th className="py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eceae4]/50">
                  {attendance.map((d: any, i: number) => (
                    <tr key={`${d.date}-${i}`}>
                      <td className="py-2.5 text-xs font-bold text-[#1c1c1c]">{d.date}</td>
                      <td className="py-2.5 text-xs text-[#5f5f5d]">{d.clockIn || "—"}</td>
                      <td className="py-2.5 text-xs text-[#5f5f5d]">{d.clockOut || "—"}</td>
                      <td className="py-2.5 text-xs font-bold text-[#1c1c1c] text-right tabular-nums">{hm(d.netHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest mb-4">Recent Activity</h3>
          {actEntries.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {actEntries.map(([k, v]) => (
                <span key={k} className="text-[10px] font-bold text-[#5f5f5d] bg-[#eceae4]/60 px-2.5 py-1 rounded-full">
                  {prettyAction(k)} <span className="text-[#1c1c1c] tabular-nums">{v}</span>
                </span>
              ))}
            </div>
          )}
          {data.recentActivity.length === 0 ? (
            <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest py-8 text-center">No recent activity</div>
          ) : (
            <div className="space-y-2.5 max-h-[280px] overflow-y-auto">
              {data.recentActivity.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1c1c1c]/30 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[#1c1c1c]">{a.summary || a.action}</div>
                    <div className="text-[10px] text-gray-400">
                      {new Date(a.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
