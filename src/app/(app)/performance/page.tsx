"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  TrendingUp, Phone, MessageSquare, CheckCircle2, Clock, Coffee,
  Zap, Calendar, User, Loader2, ChevronDown, Download, FileSpreadsheet,
  FileText, Sliders
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line
} from "recharts";
import { PageHeader, StatCard, Modal } from "@/components/ui";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { cn, formatCurrency, toDbDateString } from "@/lib/utils";
import toast from "react-hot-toast";

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

function durationToSeconds(hms: string | undefined): number {
  if (!hms) return 0;
  const [h, m, s] = hms.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

// clockInISO/clockOutISO are real timestamps from the API (already IST-
// correct server-side) - formatting here just needs to respect the 12h/24h
// toggle. timeZone stays explicit so this is right even if the browser
// itself isn't set to IST.
function formatClockTime(iso: string | undefined, use24h: boolean): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", hour12: !use24h, timeZone: "Asia/Kolkata",
  });
}

// Best-effort real logo for PDF exports - Shopify CDN assets are usually
// CORS-open for storefront use, but this must never block an export if
// that assumption is wrong somewhere, so any failure just falls back to
// the text-only branded header below.
async function tryGetLogoDataUri(): Promise<string | null> {
  try {
    const res = await fetch("https://cureforever.in/cdn/shop/files/Cureforever_TM_Logo_1.png?v=1751527749&width=200");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
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
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minNetHours, setMinNetHours] = useState("");
  const [minTasks, setMinTasks] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "netHours" | "tasks" | "revenue">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  // Advanced filters + sort apply only to the ledger table (and its
  // export) - the charts above stay showing the full unfiltered range for
  // context.
  const filteredLogs = useMemo(() => {
    let rows = [...dailyLogs];
    if (minNetHours) rows = rows.filter(d => durationToSeconds(d.netHours) >= Number(minNetHours) * 3600);
    if (minTasks) rows = rows.filter(d => (d.tasks || 0) >= Number(minTasks));
    rows.sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortBy === "date") { av = a.date; bv = b.date; }
      else if (sortBy === "netHours") { av = durationToSeconds(a.netHours); bv = durationToSeconds(b.netHours); }
      else if (sortBy === "tasks") { av = a.tasks || 0; bv = b.tasks || 0; }
      else { av = a.revenue || 0; bv = b.revenue || 0; }
      const cmp = av > bv ? 1 : av < bv ? -1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [dailyLogs, minNetHours, minTasks, sortBy, sortDir]);

  const selectedAgentName = canBrowseAgents
    ? agents.find(a => a.id === selectedAgentId)?.name || ""
    : profile?.name || "Me";

  const EXPORT_HEADERS = ["Date", "Clock In", "Clock Out", "Work Hours", "Break Hours", "Net Hours", "Tasks", "Revenue"];
  const ACTIVITY_HEADERS = ["Time", "Type", "Description"];
  const buildExportRows = () => filteredLogs.map(d => [
    d.date,
    formatClockTime(d.clockInISO, timeFormat === "24h"),
    formatClockTime(d.clockOutISO, timeFormat === "24h"),
    d.workHours?.slice(0, 5) || "",
    d.breakHours?.slice(0, 5) || "",
    d.netHours?.slice(0, 5) || "",
    d.tasks || 0,
    d.revenue || 0,
  ]);
  // Whole-page export, not just the ledger table: the same summary stat
  // cards and Recent Activity feed shown on screen, so a manager/supervisor
  // gets the full picture from one file.
  const buildSummaryRows = () => {
    const { start, end } = getRange(preset, customStart, customEnd);
    return [
      ["Agent", selectedAgentName || "N/A"],
      ["Date Range", `${start.slice(0, 10)} to ${end.slice(0, 10)}`],
      ["Revenue", formatCurrency(summary?.revenue || 0)],
      ["Calls & WhatsApp", String(summary?.taskCount || 0)],
      ["Online Hours", summary?.onlineHours?.slice(0, 5) || "00:00"],
      ["Break Hours", summary?.breakHours?.slice(0, 5) || "00:00"],
      ["Productivity", `${summary?.productivity || 0} tasks/hr`],
      ["Days Logged", String(dailyLogs.length)],
    ];
  };
  const buildActivityRows = () => recentActivity.slice(0, 30).map((a: any) => [
    new Date(a.created_at).toLocaleString([], { timeZone: "Asia/Kolkata", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    (a.activity_type || "").replace(/_/g, " "),
    a.description || a.metadata?.customer_name || "",
  ]);
  const exportFileBase = () => {
    const agentPart = (selectedAgentName || "Agent").replace(/[^a-zA-Z0-9]/g, "_");
    const { start, end } = getRange(preset, customStart, customEnd);
    return `CureForever_${agentPart}_Performance_${start.slice(0, 10)}_to_${end.slice(0, 10)}`;
  };

  async function handleExport(exportFormat: "csv" | "xlsx" | "pdf") {
    if (filteredLogs.length === 0 && recentActivity.length === 0) {
      toast.error("Nothing to export - no data in this range");
      return;
    }
    setExporting(true);
    try {
      const filename = exportFileBase();
      const summaryRows = buildSummaryRows();
      const ledgerRows = buildExportRows();
      const activityRows = buildActivityRows();

      if (exportFormat === "pdf") {
        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();

        const logoDataUri = await tryGetLogoDataUri();
        pdf.setFillColor(28, 28, 28);
        pdf.rect(0, 0, pageWidth, 32, "F");
        if (logoDataUri) {
          try {
            pdf.addImage(logoDataUri, "PNG", 10, 6, 20, 20);
          } catch {
            // Corrupt/unsupported image data - fall through to text-only header below.
          }
        }
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(16);
        pdf.text("CUREFOREVER", logoDataUri ? 34 : 10, 15);
        pdf.setFontSize(9);
        pdf.text("Daily Performance & Attendance Report", logoDataUri ? 34 : 10, 22);
        pdf.setFontSize(8);
        pdf.text(`Agent: ${selectedAgentName || "N/A"}  |  Generated: ${new Date().toLocaleString([], { timeZone: "Asia/Kolkata" })} IST`, logoDataUri ? 34 : 10, 28);

        pdf.setTextColor(28, 28, 28);
        pdf.setFontSize(11);
        pdf.text("Summary", 10, 40);
        autoTable(pdf, {
          startY: 44,
          body: summaryRows,
          theme: "plain",
          styles: { fontSize: 8, cellPadding: 1.5 },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
          margin: { left: 10, right: 10 },
        });

        let nextY = (pdf as any).lastAutoTable.finalY + 8;
        if (ledgerRows.length > 0) {
          pdf.setFontSize(11);
          pdf.text("Daily Attendance Ledger", 10, nextY);
          autoTable(pdf, {
            startY: nextY + 4,
            head: [EXPORT_HEADERS],
            body: ledgerRows,
            theme: "grid",
            headStyles: { fillColor: [28, 28, 28] },
            styles: { fontSize: 8, cellPadding: 3 },
            margin: { left: 10, right: 10 },
          });
          nextY = (pdf as any).lastAutoTable.finalY + 8;
        }

        if (activityRows.length > 0) {
          if (nextY > 250) { pdf.addPage(); nextY = 20; }
          pdf.setFontSize(11);
          pdf.text("Recent Activity", 10, nextY);
          autoTable(pdf, {
            startY: nextY + 4,
            head: [ACTIVITY_HEADERS],
            body: activityRows,
            theme: "grid",
            headStyles: { fillColor: [28, 28, 28] },
            styles: { fontSize: 8, cellPadding: 3 },
            margin: { left: 10, right: 10 },
          });
        }

        pdf.save(`${filename}.pdf`);
      } else if (exportFormat === "csv") {
        // Multi-sheet workbooks don't survive a CSV export (writeFile only
        // ever emits the first sheet for bookType "csv") - one flat file
        // with labeled sections instead, a common plain-text report shape.
        const combined: (string | number)[][] = [
          ["CUREFOREVER — PERFORMANCE REPORT"], [],
          ["SUMMARY"], ...summaryRows, [],
        ];
        if (ledgerRows.length > 0) combined.push(["DAILY ATTENDANCE LEDGER"], EXPORT_HEADERS, ...ledgerRows, []);
        if (activityRows.length > 0) combined.push(["RECENT ACTIVITY"], ACTIVITY_HEADERS, ...activityRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(combined), "Report");
        XLSX.writeFile(wb, `${filename}.csv`, { bookType: "csv" });
      } else {
        const wb = XLSX.utils.book_new();
        const summarySheet = XLSX.utils.aoa_to_sheet([["Metric", "Value"], ...summaryRows]);
        summarySheet["!cols"] = [{ wch: 20 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

        if (ledgerRows.length > 0) {
          const ledgerSheet = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...ledgerRows]);
          ledgerSheet["!cols"] = EXPORT_HEADERS.map(() => ({ wch: 14 }));
          XLSX.utils.book_append_sheet(wb, ledgerSheet, "Attendance Ledger");
        }

        if (activityRows.length > 0) {
          const activitySheet = XLSX.utils.aoa_to_sheet([ACTIVITY_HEADERS, ...activityRows]);
          activitySheet["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 40 }];
          XLSX.utils.book_append_sheet(wb, activitySheet, "Recent Activity");
        }

        XLSX.writeFile(wb, `${filename}.xlsx`);
      }
      toast.success(`Exported ${exportFormat.toUpperCase()}`);
      setShowExport(false);
    } catch (e) {
      console.error("Export failed:", e);
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

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
            <div className="px-5 py-4 border-b border-[#eceae4] bg-[#fcfbf8] flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest">Daily Attendance Ledger</h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-[#eceae4]/60 rounded-lg border border-[#eceae4] p-0.5">
                  {(["12h", "24h"] as const).map(f => (
                    <button key={f} onClick={() => setTimeFormat(f)}
                      className={cn("px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all",
                        timeFormat === f ? "bg-[#1c1c1c] text-white shadow-sm" : "text-[#5f5f5d]")}>
                      {f}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowAdvanced(!showAdvanced)}
                  className={cn("px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border flex items-center gap-1.5",
                    showAdvanced || minNetHours || minTasks || sortBy !== "date" || sortDir !== "desc"
                      ? "bg-[#1c1c1c] text-white border-[#1c1c1c]"
                      : "bg-white text-[#5f5f5d] border-[#eceae4] hover:border-[#1c1c1c]/40")}>
                  <Sliders className="w-3 h-3" /> Filters
                </button>
                <button onClick={() => setShowExport(true)}
                  className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[#1c1c1c] text-white flex items-center gap-1.5 hover:opacity-90 transition-all">
                  <Download className="w-3 h-3" /> Export
                </button>
              </div>
            </div>

            {showAdvanced && (
              <div className="px-5 py-4 border-b border-[#eceae4] bg-[#f7f4ed] flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-[#5f5f5d]/60 uppercase tracking-widest">Min Net Hours</label>
                  <input type="number" min="0" step="0.5" placeholder="e.g. 4" value={minNetHours}
                    onChange={e => setMinNetHours(e.target.value)}
                    className="text-[11px] font-bold border border-[#eceae4] rounded-lg px-3 py-2 bg-white w-28" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-[#5f5f5d]/60 uppercase tracking-widest">Min Tasks</label>
                  <input type="number" min="0" placeholder="e.g. 5" value={minTasks}
                    onChange={e => setMinTasks(e.target.value)}
                    className="text-[11px] font-bold border border-[#eceae4] rounded-lg px-3 py-2 bg-white w-28" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-[#5f5f5d]/60 uppercase tracking-widest">Sort By</label>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                    className="text-[11px] font-bold border border-[#eceae4] rounded-lg px-3 py-2 bg-white">
                    <option value="date">Date</option>
                    <option value="netHours">Net Hours</option>
                    <option value="tasks">Tasks</option>
                    <option value="revenue">Revenue</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-[#5f5f5d]/60 uppercase tracking-widest">Direction</label>
                  <select value={sortDir} onChange={e => setSortDir(e.target.value as typeof sortDir)}
                    className="text-[11px] font-bold border border-[#eceae4] rounded-lg px-3 py-2 bg-white">
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </div>
                {(minNetHours || minTasks || sortBy !== "date" || sortDir !== "desc") && (
                  <button onClick={() => { setMinNetHours(""); setMinTasks(""); setSortBy("date"); setSortDir("desc"); }}
                    className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline px-2 pb-2">
                    Reset
                  </button>
                )}
              </div>
            )}

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
                  {filteredLogs.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-gray-400">No attendance records match these filters</td></tr>
                  ) : filteredLogs.map((d, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-xs font-bold text-[#1c1c1c] whitespace-nowrap">{d.date}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap tabular-nums">{formatClockTime(d.clockInISO, timeFormat === "24h")}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap tabular-nums">{formatClockTime(d.clockOutISO, timeFormat === "24h")}</td>
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

          <Modal
            open={showExport}
            onClose={() => setShowExport(false)}
            title={`Export — ${selectedAgentName || "Performance"}`}
          >
            <div className="space-y-4">
              <p className="text-xs text-[#5f5f5d]">
                Exports the full page for {selectedAgentName || "this agent"}: summary stats, the attendance ledger
                ({filteredLogs.length} row{filteredLogs.length === 1 ? "" : "s"}, respecting any active filters), and
                recent activity — ready to share with a reporting manager or supervisor.
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                <button onClick={() => handleExport("csv")} disabled={exporting}
                  className="btn-secondary justify-start gap-3 h-12 disabled:opacity-50">
                  <FileText className="w-4 h-4" />
                  <div className="text-left">
                    <div className="text-xs font-black">CSV</div>
                    <div className="text-[10px] text-gray-400 font-normal">Plain spreadsheet, opens anywhere</div>
                  </div>
                </button>
                <button onClick={() => handleExport("xlsx")} disabled={exporting}
                  className="btn-secondary justify-start gap-3 h-12 disabled:opacity-50">
                  <FileSpreadsheet className="w-4 h-4" />
                  <div className="text-left">
                    <div className="text-xs font-black">Excel (.xlsx)</div>
                    <div className="text-[10px] text-gray-400 font-normal">Formatted workbook</div>
                  </div>
                </button>
                <button onClick={() => handleExport("pdf")} disabled={exporting}
                  className="btn-primary justify-start gap-3 h-12 disabled:opacity-50">
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <div className="text-left">
                    <div className="text-xs font-black">PDF</div>
                    <div className="text-[10px] text-white/60 font-normal">Branded report, ready to send</div>
                  </div>
                </button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
