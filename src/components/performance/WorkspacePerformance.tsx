"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { CheckCircle, ListTodo, Target, Clock, Activity } from "lucide-react";
import { StatCard } from "@/components/ui";
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
    onTimeRate: number | null;
    hoursLogged: number;
    activityCount: number;
  };
  bySpace: { space: string; done: number; open: number }[];
  daily: { date: string; minutes: number; tasksDone: number }[];
  recentActivity: { id: string; action: string; summary: string | null; created_at: string }[];
}

// hours "HH:MM:SS" -> "HH:MM"
const hm = (s?: string) => (s || "00:00:00").slice(0, 5);

export default function WorkspacePerformance({ userId, name, range }: Props) {
  const [data, setData] = useState<WsData | null>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    if (isDemoMode()) {
      setData({
        summary: { tasksDone: 37, tasksOpen: 9, onTimeRate: 84, hoursLogged: 52.5, activityCount: 128 },
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

  return (
    <div className="animate-fade-in space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        <StatCard label="Tasks Done" value={s.tasksDone} sub={name} icon={<CheckCircle className="w-4 h-4" />} />
        <StatCard label="Open Tasks" value={s.tasksOpen} sub="Currently assigned" icon={<ListTodo className="w-4 h-4" />} />
        <StatCard label="On-Time" value={s.onTimeRate == null ? "—" : `${s.onTimeRate}%`} sub="Of tasks with a due date" icon={<Target className="w-4 h-4" />} />
        <StatCard label="Hours Logged" value={`${s.hoursLogged}h`} sub="Time entries in range" icon={<Clock className="w-4 h-4" />} />
        <StatCard label="Activity" value={s.activityCount} sub="Task events in range" icon={<Activity className="w-4 h-4" />} />
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
