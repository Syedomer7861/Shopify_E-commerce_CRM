import { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Trophy, TrendingUp, Users, Wifi, WifiOff, 
  MessageCircle, Target, Phone, Eye, Smartphone, History
} from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { Avatar } from './ui';
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { AgentDetailsModal } from './hr/AgentDetailsModal';

import { createClient } from '@/lib/supabase';

interface LeaderboardProps {
  agents: any[];
}

function getPresenceStatus(lastSeenAt: string | null, isActive: boolean, status?: string) {
  if (!isActive) return { label: "Disabled", color: "bg-gray-400", textColor: "text-gray-400", online: false };
  
  const config: Record<string, { label: string, color: string, textColor: string, online: boolean }> = {
    online:  { label: "Online now", color: "bg-emerald-500", textColor: "text-emerald-600", online: true },
    meeting: { label: "In Meeting", color: "bg-indigo-500", textColor: "text-indigo-600", online: true },
    break:   { label: "On Break",   color: "bg-amber-500",  textColor: "text-amber-600",  online: true },
    lunch:   { label: "Lunch",      color: "bg-orange-500", textColor: "text-orange-600", online: true },
    away:    { label: "Away",       color: "bg-rose-500",   textColor: "text-rose-600",   online: true },
    offline: { label: "Offline",    color: "bg-gray-300",   textColor: "text-gray-400",   online: false }
  };

  // If status is explicitly provided (e.g. from forced offline check), use it
  if (status && config[status]) return config[status];

  if (!lastSeenAt) return { label: "Never seen", color: "bg-gray-300", textColor: "text-gray-400", online: false };
  
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  const minutes = Math.floor(diff / 60000);
  
  // High fidelity status: 1 minute threshold
  if (minutes < 1) return { label: "Online now", color: "bg-emerald-500", textColor: "text-emerald-600", online: true };
  
  return { label: timeAgo(lastSeenAt), color: "bg-gray-300", textColor: "text-gray-400", online: false };
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ agents: initialAgents }) => {
  const { profile: currentProfile } = useCurrentProfile();
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [selectedRange, setSelectedRange] = useState('today');
  const [metrics, setMetrics] = useState<any[]>(initialAgents);
  const [isLoading, setIsLoading] = useState(false);
  
  const supabase = useMemo(() => createClient(), []);

  const fetchMetrics = useCallback(async (range: string) => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setIsLoading(true);
      setTimeout(() => {
        setMetrics([
          { agent_id: '1', name: 'Agent Rahul', revenue_recovered: 85000, tasks_resolved: 42, total_calls: 150, total_whatsapp: 200, today_work_hours: '06:45:00', today_break_hours: '00:45:00', weekly_revenue_target: 100000, current_status: 'online', last_seen_at: new Date().toISOString(), is_active: true },
          { agent_id: '2', name: 'Agent Priya', revenue_recovered: 42000, tasks_resolved: 28, total_calls: 120, total_whatsapp: 180, today_work_hours: '05:15:00', today_break_hours: '01:15:00', weekly_revenue_target: 100000, current_status: 'break', last_seen_at: new Date(Date.now() - 300000).toISOString(), is_active: true },
          { agent_id: '3', name: 'Agent Amit', revenue_recovered: 112000, tasks_resolved: 56, total_calls: 180, total_whatsapp: 250, today_work_hours: '07:30:00', today_break_hours: '00:30:00', weekly_revenue_target: 100000, current_status: 'online', last_seen_at: new Date().toISOString(), is_active: true },
        ]);
        setIsLoading(false);
      }, 500);
      return;
    }

    setIsLoading(true);
    try {
      let url = '/api/dashboard/agent';
      const now = new Date();
      let start = new Date();
      let end = new Date();

      if (range === 'today') {
        start.setHours(0,0,0,0);
      } else if (range === 'yesterday') {
        start.setDate(start.getDate() - 1);
        start.setHours(0,0,0,0);
        end.setDate(end.getDate() - 1);
        end.setHours(23,59,59,999);
      } else if (range === '7d') {
        start.setDate(start.getDate() - 7);
      } else if (range === '30d') {
        start.setDate(start.getDate() - 30);
      }

      url += `?startDate=${start.toISOString()}&endDate=${end.toISOString()}`;

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setMetrics(json.metrics || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics(selectedRange);
  }, [selectedRange, fetchMetrics]);

  useEffect(() => {
    async function fetchRecentActivity() {
      if (!selectedAgent) return;
      const { data } = await supabase
        .from("agent_activity_logs")
        .select("*, profile:profiles(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) setRecentActivity(data);
    }
    fetchRecentActivity();
  }, [selectedAgent, supabase]);

  // Sort agents by revenue recovered (Show everyone for oversight, but hide Admins from HR)
  const sortedByRevenue = [...(metrics || [])]
    .filter(a => {
      if (currentProfile?.role?.toLowerCase() === 'admin') return true;
      return a.role?.toLowerCase() !== 'admin';
    })
    .sort((a, b) => b.revenue_recovered - a.revenue_recovered);
  
  const onlineCount = sortedByRevenue.filter(a => {
    const p = getPresenceStatus(a.last_seen_at, a.is_active !== false, a.current_status);
    return p.online;
  }).length;
  
  return (
    <div className="card overflow-hidden w-full">
      <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-[#1c1c1c]">Performance Leaderboard</h3>
            <span className="ml-1 text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {onlineCount} online
            </span>
          </div>
          
          <div className="flex items-center gap-1 bg-white border border-gray-200 p-0.5 rounded-lg shadow-sm">
            {['today', 'yesterday', '7d', '30d'].map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRange(r)}
                className={cn(
                  "px-2 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-all",
                  selectedRange === r 
                    ? "bg-[#1c1c1c] text-white shadow-sm" 
                    : "text-gray-400 hover:text-[#1c1c1c] hover:bg-gray-50"
                )}
              >
                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : r}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-12">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden lg:block">Performance Metrics</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden md:block w-32 text-center">Action</span>
        </div>
      </div>
      
      <div className={cn("divide-y divide-gray-50 transition-opacity duration-300", isLoading && "opacity-50")}>
        {sortedByRevenue.map((agent, index) => {
          const rankColor = index === 0 ? "bg-amber-100 text-amber-700" : 
                             index === 1 ? "bg-slate-100 text-slate-700" :
                             index === 2 ? "bg-orange-100 text-orange-700" : 
                             "text-gray-400 bg-gray-100";
          
          const displayName = agent.name || agent.email?.split("@")[0] || "Unknown";
          const presence = getPresenceStatus(agent.last_seen_at, agent.is_active !== false, agent.current_status);

          const totalActivity = (agent.total_calls || 0) + (agent.total_whatsapp || 0);
          const conversionRate = totalActivity > 0 ? Math.round(((agent.tasks_resolved || 0) / totalActivity) * 100) : 0;
          const targetProgress = agent.weekly_revenue_target ? Math.min(100, Math.round((agent.revenue_recovered / agent.weekly_revenue_target) * 100)) : null;
          
          // GAMIFIED BADGES
          const badges = [];
          if (index === 0 && agent.revenue_recovered > 0) badges.push({ label: "Top Closer", color: "bg-amber-500", icon: "🏆" });
          if (agent.tasks_resolved > 20) badges.push({ label: "Speed Demon", color: "bg-blue-500", icon: "⚡" });
          if (conversionRate > 70) badges.push({ label: "Efficiency Pro", color: "bg-emerald-500", icon: "🎯" });

          const workTime = agent.today_work_hours || "00:00:00";
          const breakTime = agent.today_break_hours || "00:00:00";

          return (
            <div key={agent.agent_id} className={cn(
              "px-5 py-3 flex items-center gap-4 transition-colors hover:bg-gray-50/50",
              index === 0 && "bg-amber-50/20",
              !presence.online && agent.is_active !== false && "opacity-70"
            )}>
              <div className={cn(
                "w-6 h-6 rounded-full flex shrink-0 items-center justify-center text-[10px] font-bold",
                rankColor
              )}>
                {index + 1}
              </div>
              
              <div className="relative shrink-0">
                <Avatar name={displayName} size="sm" />
                <div className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white",
                  presence.color
                )} />
              </div>
              
              <div className="flex-none w-32 md:w-44">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-bold text-[#1c1c1c] truncate">{displayName}</div>
                  {badges.map((b, i) => (
                    <span key={i} title={b.label} className="text-[10px] cursor-help" role="img" aria-label={b.label}>
                      {b.icon}
                    </span>
                  ))}
                </div>
                <div className={cn("text-[9px] font-medium flex items-center gap-1 truncate", presence.textColor)}>
                  {presence.online ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                  {presence.label} {agent.last_reason && `(${agent.last_reason})`}
                </div>

              </div>

              {/* Extended Metrics flex row for wider screen format */}
              <div className="hidden lg:flex flex-1 items-center justify-between px-6">
                 <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest mb-1 font-bold">Activity</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-1" title="Calls"><Phone className="w-2.5 h-2.5 text-blue-500" />{agent.total_calls}</span>
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-1" title="WhatsApp"><MessageCircle className="w-2.5 h-2.5 text-emerald-500" />{agent.total_whatsapp || 0}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center border-l border-gray-100 pl-6">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest mb-1 font-bold">Work Time</span>
                      <span className="text-xs font-bold text-[#1c1c1c]">{workTime}</span>
                    </div>

                    <div className="flex flex-col items-center border-l border-gray-100 pl-6">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest mb-1 font-bold">On Break</span>
                      <span className="text-xs font-bold text-amber-600">{breakTime}</span>
                    </div>

                    <div className="flex flex-col items-center border-l border-gray-100 pl-6">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest mb-1 font-bold">Resolved</span>
                      <span className="text-xs font-bold text-indigo-600">{agent.tasks_resolved}</span>
                    </div>
                 </div>

                 {targetProgress !== null && (
                   <div className="flex flex-col w-28">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Progress</span>
                        <span className="text-[9px] font-bold text-blue-600">{targetProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                         <div className="bg-blue-600 h-1 transition-all duration-500" style={{ width: `${targetProgress}%` }} />
                      </div>
                   </div>
                 )}
              </div>
              
              {/* Fallback metrics for extremely slim columns / mobile */}
              <div className="md:hidden flex-1 min-w-0 flex flex-col">
                <div className="text-[10px] text-gray-400 flex items-center gap-2">
                  <span className="flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" />{agent.total_calls}</span>
                  <span className="flex items-center gap-0.5"><MessageCircle className="w-2.5 h-2.5" />{agent.total_whatsapp || 0}</span>
                  <span className="flex items-center gap-0.5"><Users className="w-2.5 h-2.5" />{agent.tasks_resolved}</span>
                </div>
              </div>
              
              <div className="text-right shrink-0 w-24">
                <div className="text-xs font-bold text-[#1c1c1c]">₹{agent.revenue_recovered.toLocaleString()}</div>
                {conversionRate > 0 && <div className="text-[10px] text-blue-600 font-medium">{conversionRate}% Win Rate</div>}
              </div>

              {/* Actions */}
              <div className="hidden md:flex items-center gap-2 justify-center w-32 shrink-0">
                <button 
                  onClick={() => setSelectedAgent(agent)}
                  className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 hover:bg-[#1c1c1c] hover:text-white rounded-md transition-all text-[9px] font-bold"
                  title="View Performance"
                >
                  <Eye className="w-3 h-3" /> Details
                </button>

              </div>
            </div>
          );
        })}
        
        {metrics.length === 0 && (
          <div className="px-5 py-8 text-center text-xs text-gray-400 italic">
            No agent performance data available for this period.
          </div>
        )}
      </div>

      <AgentDetailsModal 
        agent={selectedAgent}
        onClose={() => setSelectedAgent(null)}
        recentActivity={recentActivity}
      />


    </div>
  );
};
