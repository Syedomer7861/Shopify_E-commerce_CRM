"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Shield, Search, Filter, Clock, User, Activity, ArrowRight, Download, RefreshCw, Loader2 as LoaderIcon } from "lucide-react";
import { PageHeader, Avatar, Pagination, AccessDenied, Modal } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { timeAgo, cn } from "@/lib/utils";
import { isAdmin } from "@/lib/permissions";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import toast from "react-hot-toast";

const ITEMS_PER_PAGE = 25;

export default function AdminLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [isPaused, setIsPaused] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [detailsLog, setDetailsLog] = useState<any>(null);

  // "History View" used to be a static <div> with no state or handler at
  // all - real date-range browsing beyond the live view's 500-row cap.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyStart, setHistoryStart] = useState("");
  const [historyEnd, setHistoryEnd] = useState("");
  const [activeRange, setActiveRange] = useState<{ start: string; end: string } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { profile, loading: profileLoading } = useCurrentProfile();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const fetchLogs = useCallback(async () => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setLoading(true);
      const mockLogs = [
        { id: '1', created_at: new Date().toISOString(), actor_email: 'admin@cureforever.com', actor_id: 'admin-1', action: 'team_member_create', summary: 'Added new demo presenter account', metadata: {} },
        { id: '2', created_at: new Date(Date.now() - 3600000).toISOString(), actor_email: 'manager@cureforever.com', actor_id: 'manager-1', action: 'order_status_update', summary: 'Updated Order #CF-1002 to Out for Delivery', metadata: {} },
        { id: '3', created_at: new Date(Date.now() - 7200000).toISOString(), actor_email: 'system@internal.com', actor_id: 'sys', action: 'inventory_sync_complete', summary: 'Successfully synced 1,240 items from Shopify', metadata: {} },
        { id: '4', created_at: new Date(Date.now() - 10800000).toISOString(), actor_email: 'admin@cureforever.com', actor_id: 'admin-1', action: 'campaign_launch', summary: 'Launched "Summer Sale 2024" broadcast to 5,000 customers', metadata: {} },
        { id: '5', created_at: new Date(Date.now() - 86400000).toISOString(), actor_email: 'agent@cureforever.com', actor_id: 'agent-1', action: 'customer_delete', summary: 'Deleted customer record with ID: CUST-998 (Duplicate)', metadata: {} },
      ];
      setLogs(mockLogs);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500); // Most-recent live view only - full history uses fetchHistory below

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      toast.error("Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Real date-range browsing, not capped at the live view's 500 rows -
  // pages through with .range() so an admin can actually search older
  // audit history instead of only ever seeing "recent activity".
  const fetchHistory = useCallback(async (start: string, end: string) => {
    setHistoryLoading(true);
    try {
      const PAGE = 1000;
      let all: any[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("audit_logs")
          .select("*")
          .gte("created_at", `${start}T00:00:00.000Z`)
          .lte("created_at", `${end}T23:59:59.999Z`)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
      }
      setLogs(all);
      setCurrentPage(1);
      toast.success(`Loaded ${all.length} log entries for ${start} to ${end}`);
    } catch (err) {
      toast.error("Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (profileLoading || !profile) return;
    if (!isAdmin(profile)) return;

    // History mode is a one-shot fetch for a fixed range - no live
    // subscription, since new events streaming in while browsing a past
    // date range would be confusing, not helpful.
    if (activeRange) {
      fetchHistory(activeRange.start, activeRange.end);
      return;
    }

    fetchLogs();

    // ── Supabase real-time: new audit_logs stream in live ──
    if (!isPaused) {
      const channel = supabase
        .channel("audit-logs-live")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" },
          () => fetchLogs())
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [isPaused, profile, profileLoading, fetchLogs, fetchHistory, activeRange, supabase]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.actor_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.summary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = actionFilter === "all" || log.action === actionFilter;
    
    return matchesSearch && matchesAction;
  });

  const uniqueActions = Array.from(new Set(logs.map(l => l.action)));

  // Was a button with no onClick at all - clicking "Export CSV" did
  // nothing. Exports whatever's currently filtered/searched, matching the
  // pattern used elsewhere in this app (Orders/Customers CSV export).
  function exportCsv() {
    if (filteredLogs.length === 0) {
      toast.error("No logs to export");
      return;
    }
    const escape = (val: any) => {
      if (val === null || val === undefined) return "";
      const str = String(val).replace(/"/g, '""');
      return str.includes(",") || str.includes("\n") || str.includes('"') ? `"${str}"` : str;
    };
    const headers = ["Timestamp", "User", "Action", "Summary"];
    const rows = filteredLogs.map(log => [
      new Date(log.created_at).toLocaleString(),
      log.actor_email || "System",
      log.action?.replace(/_/g, " ") || "",
      log.summary || "",
    ].map(escape));
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alert_logs_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredLogs.length} log entries`);
  }
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (profileLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <LoaderIcon className="w-8 h-8 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!isAdmin(profile)) {
    return <AccessDenied title="Admin Only" desc="This area is restricted to system administrators." />;
  }

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-[#1c1c1c]" />
            <span>Alert & Action Logs</span>
          </div>
        }
        subtitle="Real-time permanent record of all user activities across the platform"
        actions={
          <div className="flex items-center gap-2">
            {activeRange ? (
              <button
                onClick={() => { setActiveRange(null); setHistoryStart(""); setHistoryEnd(""); }}
                className="btn-secondary flex items-center gap-2 bg-[#1c1c1c] text-white border-[#1c1c1c]"
              >
                <Clock className="w-4 h-4" /> Back to Live
              </button>
            ) : (
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={cn(
                  "btn-secondary flex items-center gap-2",
                  isPaused && "bg-amber-50 border-amber-200 text-amber-700"
                )}
              >
                {isPaused ? <Activity className="w-4 h-4 animate-pulse" /> : <RefreshCw className="w-4 h-4 animate-spin-slow" />}
                {isPaused ? "Live Paused" : "Live Feed Active"}
              </button>
            )}
            <button onClick={exportCsv} className="btn-primary flex items-center gap-2">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by user, action, or summary..."
            className="input pl-10"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select 
            className="input pl-10 appearance-none capitalize"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">All Actions</option>
            {uniqueActions.map(action => (
              <option key={action} value={action}>{action.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className={cn(
              "flex items-center gap-2 px-3 h-full w-full rounded-xl text-xs font-bold border transition-colors",
              activeRange ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-gray-500 border-[#eceae4] hover:border-gray-300"
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            {activeRange ? `${activeRange.start} → ${activeRange.end}` : "History View"}
          </button>
          {historyOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-[#eceae4] rounded-xl shadow-lg p-4 z-20 space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Browse a date range</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">From</label>
                  <input type="date" className="input text-xs h-9 w-full" value={historyStart} onChange={e => setHistoryStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">To</label>
                  <input type="date" className="input text-xs h-9 w-full" value={historyEnd} onChange={e => setHistoryEnd(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!historyStart || !historyEnd || historyLoading}
                  onClick={() => {
                    if (!historyStart || !historyEnd) return;
                    setActiveRange({ start: historyStart, end: historyEnd });
                    setHistoryOpen(false);
                  }}
                  className="btn-primary flex-1 text-xs py-2 disabled:opacity-50"
                >
                  {historyLoading ? "Loading..." : "Apply"}
                </button>
                {activeRange && (
                  <button
                    onClick={() => { setActiveRange(null); setHistoryStart(""); setHistoryEnd(""); setHistoryOpen(false); }}
                    className="btn-secondary text-xs py-2 px-3"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1c1c1c] text-[#fcfbf8]">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Timestamp</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">User</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Action</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Details</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-right">Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae4]">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center">
                    <LoaderIcon className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">No logs found matching your criteria.</td>
                </tr>
              ) : (
                paginatedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[rgba(28,28,28,0.02)] transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs font-bold text-[#1c1c1c]">{new Date(log.created_at).toLocaleString()}</div>
                      <div className="text-[10px] text-gray-400 font-medium">{timeAgo(log.created_at)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <Avatar name={log.actor_email || "S"} size="sm" />
                        <div>
                          <div className="text-xs font-bold text-[#1c1c1c]">{log.actor_email || "System"}</div>
                          <div className="text-[10px] text-gray-400 tabular-nums">{log.actor_id?.substring(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border",
                        log.action.includes("delete") || log.action.includes("skip") ? "bg-rose-50 border-rose-100 text-rose-600" :
                        log.action.includes("complete") || log.action.includes("create") ? "bg-emerald-50 border-emerald-100 text-emerald-600" :
                        "bg-[#1c1c1c]/5 border-[#1c1c1c]/10 text-[#1c1c1c]"
                      )}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[11px] text-[#5f5f5d] font-medium leading-relaxed line-clamp-2 max-w-md">
                        {log.summary}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setDetailsLog(log)}
                        className="p-2 hover:bg-[#1c1c1c] hover:text-[#fcfbf8] rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          current={currentPage}
          total={filteredLogs.length}
          pageSize={ITEMS_PER_PAGE}
          onChange={setCurrentPage}
        />
      </div>

      {/* Was console.log(log.metadata) + a toast telling the admin to open
          DevTools - the actual event context was never shown in the UI at
          all. */}
      <Modal open={!!detailsLog} onClose={() => setDetailsLog(null)} title="Event Context">
        {detailsLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Action</div>
                <div className="font-bold text-[#1c1c1c]">{detailsLog.action?.replace(/_/g, " ")}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Timestamp</div>
                <div className="font-bold text-[#1c1c1c]">{new Date(detailsLog.created_at).toLocaleString()}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">User</div>
                <div className="font-bold text-[#1c1c1c]">{detailsLog.actor_email || "System"}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Summary</div>
                <div className="text-[#5f5f5d]">{detailsLog.summary}</div>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Raw Metadata</div>
              {detailsLog.metadata && Object.keys(detailsLog.metadata).length > 0 ? (
                <pre className="bg-gray-50 rounded-xl p-3 text-[11px] font-mono text-[#5f5f5d] overflow-x-auto max-h-64 overflow-y-auto">
                  {JSON.stringify(detailsLog.metadata, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-gray-400 italic">No additional metadata for this event.</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Loader2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
