"use client";
import { useEffect, useState, useCallback } from "react";
import { isDemoMode } from "@/lib/demo";
import {
  Users, Search, Clock,
  RefreshCcw, AlertCircle,
  Coffee, UserCheck,
} from "lucide-react";
import { PageHeader, Avatar, AccessDenied, Pagination } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface AgentStatus {
  id: string;
  name: string;
  email: string;
  status: string;
  last_seen_at: string;
  onlineHours: string;
  breakHours: string;
  taskCount: number;
  revenue: number;
  lastReason?: string;
}

export default function FloorViewPage() {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [mounted, setMounted] = useState(false);
  const ITEMS_PER_PAGE = 12;
  const { profile, loading: profileLoading } = useCurrentProfile();
  const supabase = createClient();



  const fetchFloorData = useCallback(async () => {
    const isDemo = isDemoMode();
    if (isDemo) {
      setAgents([
        { id: '1', name: 'Agent Rahul', email: 'rahul@cureforever.com', status: 'online', last_seen_at: new Date().toISOString(), onlineHours: '06:45', breakHours: '00:45', taskCount: 42, revenue: 85000 },
        { id: '2', name: 'Agent Priya', email: 'priya@cureforever.com', status: 'break', last_seen_at: new Date(Date.now() - 300000).toISOString(), onlineHours: '05:15', breakHours: '01:15', taskCount: 28, revenue: 42000, lastReason: 'Lunch' },
        { id: '3', name: 'Agent Amit', email: 'amit@cureforever.com', status: 'online', last_seen_at: new Date().toISOString(), onlineHours: '07:30', breakHours: '00:30', taskCount: 56, revenue: 112000 },
        { id: '4', name: 'Agent Sneha', email: 'sneha@cureforever.com', status: 'meeting', last_seen_at: new Date(Date.now() - 600000).toISOString(), onlineHours: '04:45', breakHours: '00:45', taskCount: 22, revenue: 35000, lastReason: 'Weekly Sync' },
        { id: '5', name: 'Agent Vikram', email: 'vikram@cureforever.com', status: 'offline', last_seen_at: new Date(Date.now() - 3600000).toISOString(), onlineHours: '04:00', breakHours: '00:30', taskCount: 15, revenue: 18000 },
      ]);
      setLoading(false);
      return;
    }

    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const start = today.toISOString();
      const end = new Date().toISOString();

      const res = await fetch(`/api/admin/analytics/agents?start=${start}&end=${end}`);
      const data = await res.json();
      
      if (data.success) {
        setAgents(data.data);
      }
    } catch (err) {
      console.error("Floor fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchFloorData();

    // Page is titled "Live Operations Floor / Real-time monitoring" but
    // had no auto-refresh at all - only the initial load and a manual
    // Sync Floor click, so agent status/tasks/revenue silently went stale
    // the moment someone stopped clicking. 60s polling, matching the
    // fallback interval every other live-data page in this app already uses.
    const poll = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchFloorData();
    }, 60_000);
    return () => clearInterval(poll);
  }, [fetchFloorData]);

  if (profileLoading) return <div className="p-12 text-center text-[#5f5f5d]">Verifying credentials...</div>;
  if (!hasPermission(profile, "view_analytics")) {
    return <AccessDenied title="Operational Floor Locked" desc="Only admins and supervisors can access real-time floor monitoring." />;
  }

  const filteredAgents = agents.filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase()) || 
    a.email.toLowerCase().includes(search.toLowerCase())
  );

  const paginatedAgents = filteredAgents.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = {
    online: agents.filter(a => a.status === "online").length,
    break: agents.filter(a => ["break", "lunch", "away"].includes(a.status)).length,
    meeting: agents.filter(a => a.status === "meeting").length,
    offline: agents.filter(a => a.status === "offline" || !a.status).length,
  };

  return (
    <div className="animate-fade-in pb-20">
      <PageHeader 
        title="Live Operations Floor" 
        subtitle="Real-time monitoring of team availability and productivity"
        actions={
          <div className="flex items-center gap-2 bg-[#eceae4]/30 p-1 rounded-lg border border-[#eceae4]">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white shadow-sm border border-[#eceae4]">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-wider">{stats.online} Active</span>
            </div>
            <div className="px-3 py-1.5 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-wider">
              {stats.break} Breaks
            </div>
          </div>
        }
      />

      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5f5f5d]" />
          <input 
            type="text" 
            placeholder="Search agents by name or email..." 
            className="input pl-10 h-12 bg-white border-[#eceae4] text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button 
          onClick={() => { setLoading(true); fetchFloorData(); }}
          className="btn-secondary h-12 px-6 gap-2"
        >
          <RefreshCcw className={cn("w-4 h-4", loading && "animate-spin")} />
          Sync Floor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {paginatedAgents.map(agent => (
          <AgentCard key={agent.id} agent={agent} mounted={mounted} />
        ))}
        {filteredAgents.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-[#eceae4]">
             <Users className="w-10 h-10 text-[#eceae4] mx-auto mb-3" />
             <div className="text-[#1c1c1c] font-bold">No agents found</div>
             <div className="text-xs text-[#5f5f5d] mt-1">Try adjusting your search criteria</div>
          </div>
        )}
      </div>

      <div className="mt-8">
        <Pagination 
          current={currentPage}
          total={filteredAgents.length}
          pageSize={ITEMS_PER_PAGE}
          onChange={setCurrentPage}
        />
      </div>
    </div>
  );
}

function AgentCard({ agent, mounted }: { agent: AgentStatus, mounted: boolean }) {
  const isOnline = agent.status === "online";
  const isBreak = ["break", "lunch", "away"].includes(agent.status);
  const isMeeting = agent.status === "meeting";
  
  const statusConfig: Record<string, { label: string, color: string, icon: any }> = {
    online:   { label: "Productive", color: "text-emerald-700 bg-emerald-50 border-emerald-100", icon: UserCheck },
    meeting:  { label: "Meeting",    color: "text-indigo-700 bg-indigo-50 border-indigo-100", icon: Users },
    break:    { label: "On Break",   color: "text-amber-700 bg-amber-50 border-amber-100", icon: Coffee },
    lunch:    { label: "Lunch",      color: "text-orange-700 bg-orange-50 border-orange-100", icon: Coffee },
    away:     { label: "Away",       color: "text-rose-700 bg-rose-50 border-rose-100", icon: AlertCircle },
    offline:  { label: "Offline",    color: "text-[#5f5f5d] bg-gray-50 border-gray-100", icon: Clock },
  };

  const config = statusConfig[agent.status] || statusConfig.offline;
  const Icon = config.icon;

  const lastSeenStr = agent.last_seen_at && mounted
    ? new Date(agent.last_seen_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : "--:--";

  return (
    <div className={cn(
      "card p-5 group hover:shadow-xl transition-all duration-300 border-l-4",
      isOnline ? "border-l-emerald-500" : isBreak ? "border-l-amber-500" : isMeeting ? "border-l-indigo-500" : "border-l-gray-300"
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <Avatar name={agent.name} size="md" />
          <div className={cn(
            "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white",
            isOnline ? "bg-emerald-500 animate-pulse" : isBreak ? "bg-amber-500" : isMeeting ? "bg-indigo-500" : "bg-gray-400"
          )} />
        </div>
        <div className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5", config.color)}>
          <Icon className="w-3 h-3" />
          {config.label}
        </div>
      </div>

      <div className="mb-5">
        <div className="text-sm font-bold text-[#1c1c1c] truncate">{agent.name}</div>
        <div className="text-[10px] text-[#5f5f5d] truncate mb-2">{agent.email}</div>
        
        {agent.lastReason && (
           <div className="text-[10px] font-medium bg-[#eceae4]/40 px-2 py-1 rounded text-[#1c1c1c] mb-2 inline-block">
             Reason: <span className="font-bold">{agent.lastReason}</span>
           </div>
        )}

        <div className="flex items-center gap-1 text-[9px] text-[#5f5f5d] font-bold uppercase tracking-widest opacity-60">
          Last Pulse: {lastSeenStr}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#eceae4]">
        <div>
          <div className="text-[9px] text-[#5f5f5d] font-bold uppercase tracking-widest opacity-60 mb-1">Productive</div>
          <div className="text-xs font-bold text-[#1c1c1c] flex items-center gap-1.5">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
             {agent.onlineHours}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-[#5f5f5d] font-bold uppercase tracking-widest opacity-60 mb-1">On Break</div>
          <div className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
             <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
             {agent.breakHours}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="p-2 rounded-lg bg-[#f7f4ed] border border-[#eceae4]">
          <div className="text-[8px] text-[#5f5f5d] font-bold uppercase tracking-widest mb-0.5 text-center">Tasks</div>
          <div className="text-sm font-bold text-[#1c1c1c] text-center">{agent.taskCount}</div>
        </div>
        <div className="p-2 rounded-lg bg-[#f7f4ed] border border-[#eceae4]">
          <div className="text-[8px] text-[#5f5f5d] font-bold uppercase tracking-widest mb-0.5 text-center">Revenue</div>
          <div className="text-sm font-bold text-[#1c1c1c] text-center">₹{Math.round(agent.revenue).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
