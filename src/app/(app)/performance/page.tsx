"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  TrendingUp, Phone, MessageSquare, CheckCircle2, Clock, Coffee,
  Zap, Calendar, User, Loader2, ChevronDown
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line
} from "recharts";
import { PageHeader, StatCard } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { cn, formatCurrency, toDbDateString } from "@/lib/utils";

type RangePreset = "today" | "7d" | "30d" | "90d" | "custom";

function getRange(preset: RangePreset, customStart: string, customEnd: string) {
  const end = new Date();
  const start = new Date();
  if (preset === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (preset === "7d") {
    start.setDate(start.getDate() - 7);
  } else if (preset === "30d") {
    start.setDate(start.getDate() - 30);
  } else if (preset === "90d") {
    start.setDate(start.getDate() - 90);
  } else {
    return {
      start: customStart ? `${customStart}T00:00:00.000Z` : new Date(Date.now() - 30 * 86400000).toISOString(),
      end: customEnd ? `${customEnd}T23:59:59.999Z` : end.toISOString(),
    };
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function PerformancePage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const supabase = createClient();
  const canBrowseAgents = hasPermission(profile, "view_analytics");

  const [preset, setPreset] = useState<RangePreset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Agent-picker roster for admin/manager/hr - agents just see themselves.
  useEffect(() => {
    if (!canBrowseAgents) return;
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) return;
    supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "agent")
      .eq("is_active", true)
      .not("email", "ilike", "%demo%")
      .not("name", "ilike", "%demo%")
      .or("is_demo.is.null,is_demo.eq.false")
      .order("name")
      .then(({ data }) => {
        if (data) setAgents(data);
      });
  }, [canBrowseAgents, supabase]);

  const fetchPerformance = useCallback(async () => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setLoading(true);
      const days = 14;
      const mockDaily = Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.now() - (days - 1 - i) * 86400000);
        return {
          date: toDbDateString(d),
          clockIn: "09:15", clockOut: "18:40",
          workHours: "08:12:00", breakHours: "00:45:00", netHours: "07:27:00",
          tasks: Math.floor(Math.random() * 12) + 3,
          revenue: Math.floor(Math.random() * 8000),
          status: "Present",
        };
      });
      setSummary({
        onlineHours: "62:10:00", breakHours: "05:20:00", taskCount: 84,
        revenue: 62500, productivity: "1.4", status: "online",
      });
      setDailyLogs(mockDaily);
      setRecentActivity([]);
      setLoading(false);
      return;
    }

    const targetAgentId = canBrowseAgents ? selectedAgentId : profile?.id;
    if (!targetAgentId) { setLoading(false); return; }

    setLoading(true);
    const { start, end } = getRange(preset, customStart, customEnd);
    try {
      const res = await fetch(`/api/admin/analytics/agents?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&agentId=${targetAgentId}`);
      const json = await res.json();
      if (json.success) {
        setSummary(json.data?.[0] || null);
        setDailyLogs(json.dailyLogs || []);
        setRecentActivity(json.recentActivity || []);
      }
    } catch (e) {
      console.error("Performance fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, [preset, customStart, customEnd, selectedAgentId, canBrowseAgents, profile?.id]);

  useEffect(() => {
    if (profileLoading) return;
    // Agents view themselves automatically; privileged roles need a pick first.
    if (!canBrowseAgents && profile?.id) {
      setSelectedAgentId(profile.id);
    }
  }, [profileLoading, canBrowseAgents, profile?.id]);

  useEffect(() => {
    if (profileLoading) return;
    if (canBrowseAgents && !selectedAgentId) { setLoading(false); return; }
    fetchPerformance();
  }, [profileLoading, canBrowseAgents, selectedAgentId, fetchPerformance]);

  const chartData = useMemo(() => {
    return [...dailyLogs].reverse().map(d => {
      const [h, m, s] = (d.workHours || "0:0:0").split(":").map(Number);
      return {
        date: d.date?.slice(5) || "",
        tasks: d.tasks || 0,
        revenue: d.revenue || 0,
        hours: Math.round(((h * 3600 + m * 60 + s) / 3600) * 10) / 10,
      };
    });
  }, [dailyLogs]);

  const selectedAgentName = canBrowseAgents
    ? agents.find(a => a.id === selectedAgentId)?.name || ""
    : profile?.name || "Me";

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#1c1c1c] animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Performance"
        subtitle={canBrowseAgents ? "Detailed history for any agent - calls, revenue, attendance, activity" : "Your detailed performance history"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canBrowseAgents && (
              <div className="relative">
                <select
                  className="select text-xs h-9 pr-8 appearance-none bg-white"
                  value={selectedAgentId}
                  onChange={e => setSelectedAgentId(e.target.value)}
                >
                  <option value="">Select an agent...</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            )}
            <div className="flex items-center bg-[#eceae4]/40 rounded-xl border border-[#eceae4] p-1">
              {(["today", "7d", "30d", "90d"] as RangePreset[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                    preset === p ? "bg-[#1c1c1c] text-white shadow" : "text-[#5f5f5d]")}
                >
                  {p === "today" ? "Today" : p.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input type="date" className="input text-xs h-9 w-[130px]" value={customStart}
                onChange={e => { setCustomStart(e.target.value); setPreset("custom"); }} />
              <span className="text-xs text-gray-400">to</span>
              <input type="date" className="input text-xs h-9 w-[130px]" value={customEnd}
                onChange={e => { setCustomEnd(e.target.value); setPreset("custom"); }} />
            </div>
          </div>
        }
      />

      {canBrowseAgents && !selectedAgentId ? (
        <div className="card p-16 text-center">
          <User className="w-10 h-10 text-gray-200 mx-auto mb-4" />
          <p className="text-sm font-bold text-gray-400">Select an agent to view their performance</p>
        </div>
      ) : loading ? (
        <div className="p-12 text-center text-gray-400 text-sm">Loading performance data...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-6">
            <StatCard label="Revenue" value={formatCurrency(summary?.revenue || 0)} sub={selectedAgentName} icon={<TrendingUp className="w-4 h-4" />} />
            <StatCard label="Calls & WA" value={summary?.taskCount || 0} sub="Total logged" icon={<Phone className="w-4 h-4" />} />
            <StatCard label="Online Hours" value={summary?.onlineHours?.slice(0, 5) || "00:00"} sub="Productive time" icon={<Clock className="w-4 h-4" />} />
            <StatCard label="Break Hours" value={summary?.breakHours?.slice(0, 5) || "00:00"} sub="Non-productive" icon={<Coffee className="w-4 h-4" />} />
            <StatCard label="Productivity" value={`${summary?.productivity || 0}/hr`} sub="Tasks per hour" icon={<Zap className="w-4 h-4" />} />
            <StatCard label="Days Logged" value={dailyLogs.length} sub="In range" icon={<Calendar className="w-4 h-4" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <div className="card p-5">
              <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest mb-4">Daily Activity</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceae4" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#5f5f5d" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#5f5f5d" }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12, border: "1px solid #eceae4" }} />
                    <Bar dataKey="tasks" fill="#1c1c1c" radius={[4, 4, 0, 0]} name="Tasks" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card p-5">
              <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest mb-4">Online Hours Trend</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceae4" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#5f5f5d" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#5f5f5d" }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12, border: "1px solid #eceae4" }} />
                    <Line type="monotone" dataKey="hours" stroke="#1c1c1c" strokeWidth={2} dot={{ r: 2 }} name="Hours" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-[#eceae4] bg-[#fcfbf8]">
              <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest">Daily Attendance Ledger</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#eceae4] bg-gray-50/50">
                    {["Date", "Clock In", "Clock Out", "Work Hours", "Break Hours", "Net Hours", "Tasks", "Revenue"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dailyLogs.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-gray-400">No attendance records in this range</td></tr>
                  ) : dailyLogs.map((d, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-xs font-bold text-[#1c1c1c] whitespace-nowrap">{d.date}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{d.clockIn}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{d.clockOut}</td>
                      <td className="px-4 py-3 text-xs font-bold text-[#1c1c1c] tabular-nums">{d.workHours?.slice(0, 5)}</td>
                      <td className="px-4 py-3 text-xs text-amber-600 tabular-nums">{d.breakHours?.slice(0, 5)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-emerald-600 tabular-nums">{d.netHours?.slice(0, 5)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-[#1c1c1c]">{d.tasks}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatCurrency(d.revenue || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#eceae4] bg-[#fcfbf8]">
              <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest">Recent Activity</h3>
            </div>
            <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
              {recentActivity.length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-gray-400">No activity in this range</div>
              ) : recentActivity.slice(0, 30).map((a: any, i: number) => (
                <div key={a.id || i} className="px-5 py-3 flex items-center gap-3">
                  {a.activity_type?.includes("whatsapp") ? <MessageSquare className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 text-[#1c1c1c]/40 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[#1c1c1c] truncate">{(a.activity_type || "").replace(/_/g, " ")}</div>
                    <div className="text-[10px] text-gray-400 truncate">{a.description || a.metadata?.customer_name || ""}</div>
                  </div>
                  <div className="text-[10px] text-gray-300 whitespace-nowrap">{new Date(a.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
