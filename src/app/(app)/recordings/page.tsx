"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { PageHeader, EmptyState, Modal, Avatar, AccessDenied } from "@/components/ui";
import { Headphones, Play, PhoneCall, Clock, CheckCircle2, User, Search, Loader2, Calendar } from "lucide-react";
import { formatDateTime, timeAgo } from "@/lib/utils";
import type { RawCallLog } from "@/types";
import toast from "react-hot-toast";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { isDemoMode } from "@/lib/demo";

export default function CallRecordingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [logs, setLogs] = useState<RawCallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");

  // Only the columns the table renders + playback. The old query did
  // SELECT * over EVERY recorded call in history on every page open.
  const RECORDING_COLS = "id, customer_phone, duration_seconds, created_at, recording_url, agent:profiles(name, email)";
  const PAGE_SIZE = 50;

  // page = 0 → newest 50; "Load More" fetches the next 50 and appends.
  // Older recordings stay reachable by paging back through them.
  const fetchPage = useCallback(async (page: number) => {
    const isDemo = typeof document !== 'undefined' && isDemoMode();
    if (isDemo) {
      const { MOCK_RAW_CALLS } = await import('@/lib/mock-data');
      return { rows: MOCK_RAW_CALLS.filter((c: any) => c.recording_url) as any[], more: false };
    }
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("raw_call_logs")
      .select(RECORDING_COLS)
      .not("recording_url", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.warn("Error fetching call recordings, table might be missing:", error);
      return { rows: [], more: false };
    }
    return { rows: (data || []) as any[], more: (data?.length || 0) === PAGE_SIZE };
  }, [supabase]);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const { rows, more } = await fetchPage(0);
      setLogs(rows);
      setHasMore(more);
    } catch (err) {
      console.error(err);
      setLogs([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const nextPage = Math.floor(logs.length / PAGE_SIZE);
      const { rows, more } = await fetchPage(nextPage);
      setLogs(prev => [...prev, ...rows]);
      setHasMore(more);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, logs.length]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const filteredLogs = logs.filter(log => {
    if (!search) return true;
    const s = search.toLowerCase();
    const agentName = (log.agent?.name || log.agent?.email || "Agent").toLowerCase();
    const phone = log.customer_phone?.toLowerCase() || "";
    return agentName.includes(s) || phone.includes(s);
  });

  if (profileLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
      </div>
    );
  }

  // Call recordings are real customer conversation audio - genuinely
  // sensitive PII - but this page had no role check at all, unlike Live
  // Floor/Alert Logs/Manager Hub which all restrict access. Same gate Live
  // Floor uses: agents can't browse recordings, HR/manager/admin can for
  // quality oversight.
  if (!hasPermission(profile, "view_analytics")) {
    return <AccessDenied title="Call Recordings Restricted" desc="Only admins and supervisors can access call recordings." />;
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <PageHeader 
        title="Call Recordings" 
        subtitle="Listen to and audit recent agent calls."
        actions={
          <div className="relative w-64">
            <Search className="w-4 h-4 text-[#5f5f5d] absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search agent or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-[#eceae4] rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold focus:ring-[#1c1c1c] shadow-sm text-[#1c1c1c]"
            />
          </div>
        }
      />

      <div className="card bg-white border border-[#eceae4] shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#eceae4] flex items-center justify-between bg-[#fcfbf8]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-[0.2em]">Recent Recordings</h3>
          </div>
          <div className="text-[10px] font-black text-[#5f5f5d] uppercase tracking-widest opacity-60">
            {logs.length} Logs Found
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#5f5f5d]">
            <Loader2 className="w-8 h-8 animate-spin text-[#1c1c1c] mb-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Loading Recordings...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12">
             <EmptyState 
                icon={<Headphones className="w-6 h-6" />} 
                title={search ? "No matches found" : "No Recordings Available"} 
                desc={search ? "Try adjusting your search criteria." : "There are currently no call recordings in the system. They will appear here once agents complete their calls."} 
             />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#eceae4]">
                  <th className="px-6 py-4 text-[9px] font-black text-[#5f5f5d] uppercase tracking-[0.2em]">Agent</th>
                  <th className="px-6 py-4 text-[9px] font-black text-[#5f5f5d] uppercase tracking-[0.2em]">Customer</th>
                  <th className="px-6 py-4 text-[9px] font-black text-[#5f5f5d] uppercase tracking-[0.2em]">Duration</th>
                  <th className="px-6 py-4 text-[9px] font-black text-[#5f5f5d] uppercase tracking-[0.2em]">Time</th>
                  <th className="px-6 py-4 text-[9px] font-black text-[#5f5f5d] uppercase tracking-[0.2em]">Recording</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eceae4]/60">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-[#fcfbf8] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={log.agent?.name || log.agent?.email || "Agent"} size="sm" />
                        <div>
                          <div className="text-xs font-bold text-[#1c1c1c]">{log.agent?.name || "Unknown Agent"}</div>
                          <div className="text-[10px] text-[#5f5f5d]">{log.agent?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#eceae4] flex items-center justify-center flex-shrink-0">
                          <User className="w-3 h-3 text-[#5f5f5d]" />
                        </div>
                        <span className="text-xs font-bold text-[#1c1c1c]">{log.customer_phone || "Unknown Number"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold tabular-nums text-[#1c1c1c] px-2.5 py-1 bg-[#eceae4] rounded-lg">
                        {formatDuration(log.duration_seconds)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-[#1c1c1c]">{formatDateTime(log.created_at)}</span>
                        <span className="text-[10px] text-[#5f5f5d] flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" /> {timeAgo(log.created_at)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {log.recording_url ? (
                        <div className="flex items-center gap-3 bg-[#eceae4]/30 p-2 rounded-xl border border-[#eceae4] group-hover:border-[#1c1c1c]/20 transition-all">
                          <div className="w-8 h-8 rounded-lg bg-[#1c1c1c] flex items-center justify-center shadow-md flex-shrink-0">
                            <Headphones className="w-3.5 h-3.5 text-white" />
                          </div>
                          <audio 
                            controls 
                            src={log.recording_url} 
                            className="h-8 w-48 [&::-webkit-media-controls-panel]:bg-transparent [&::-webkit-media-controls-panel]:px-0" 
                          />
                        </div>
                      ) : (
                        <span className="text-[10px] text-[#5f5f5d] italic">No Recording</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && hasMore && (
          <div className="px-6 py-4 border-t border-[#eceae4] bg-[#fcfbf8] flex items-center justify-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="btn-secondary text-xs gap-2 disabled:opacity-50"
            >
              {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
              Load older recordings
            </button>
          </div>
        )}
        {!loading && search && hasMore && (
          <div className="px-6 pb-4 text-center text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest opacity-60">
            Search covers loaded recordings — load more to search older calls
          </div>
        )}
      </div>
    </div>
  );
}
