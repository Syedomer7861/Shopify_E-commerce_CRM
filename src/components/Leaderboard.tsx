import React from 'react';
import { Trophy, TrendingUp, Users, Wifi, WifiOff, MessageCircle, Target } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { Avatar } from './ui';

interface LeaderboardProps {
  agents: any[];
}

function getPresenceStatus(lastSeenAt: string | null, isActive: boolean) {
  if (!isActive) return { label: "Disabled", color: "bg-gray-400", textColor: "text-gray-400", online: false };
  if (!lastSeenAt) return { label: "Never seen", color: "bg-gray-300", textColor: "text-gray-400", online: false };
  
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  const minutes = Math.floor(diff / 60000);
  
  if (minutes < 2) return { label: "Online now", color: "bg-blue-500", textColor: "text-blue-600", online: true };
  if (minutes < 10) return { label: `${minutes}m ago`, color: "bg-amber-400", textColor: "text-amber-600", online: true };
  if (minutes < 60) return { label: `${minutes}m ago`, color: "bg-orange-400", textColor: "text-orange-500", online: false };
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours}h ago`, color: "bg-rose-400", textColor: "text-rose-500", online: false };
  
  return { label: timeAgo(lastSeenAt), color: "bg-gray-400", textColor: "text-gray-400", online: false };
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ agents }) => {
  // Sort agents by revenue recovered and filter out admins
  const sortedByRevenue = [...agents]
    .filter(a => a.role !== 'admin')
    .sort((a, b) => b.revenue_recovered - a.revenue_recovered);
  
  const onlineCount = sortedByRevenue.filter(a => {
    const p = getPresenceStatus(a.last_seen_at, a.is_active !== false);
    return p.online;
  }).length;
  
  return (
    <div className="card overflow-hidden w-full">
      <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-[#2D1E6F]">Agent Leaderboard</h3>
          <span className="ml-1 text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            {onlineCount} online
          </span>
        </div>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden md:block">Performance Metrics</span>
      </div>
      
      <div className="divide-y divide-gray-50">
        {sortedByRevenue.map((agent, index) => {
          const rankColor = index === 0 ? "bg-amber-100 text-amber-700" : 
                             index === 1 ? "bg-slate-100 text-slate-700" :
                             index === 2 ? "bg-orange-100 text-orange-700" : 
                             "text-gray-400 bg-gray-100";
          
          const displayName = agent.name || agent.email?.split("@")[0] || "Unknown";
          const presence = getPresenceStatus(agent.last_seen_at, agent.is_active !== false);

          const totalActivity = (agent.total_calls || 0) + (agent.total_whatsapp || 0);
          const conversionRate = totalActivity > 0 ? Math.round(((agent.tasks_resolved || 0) / totalActivity) * 100) : 0;
          const targetProgress = agent.weekly_revenue_target ? Math.min(100, Math.round((agent.revenue_recovered / agent.weekly_revenue_target) * 100)) : null;

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
              
              <div className="flex-none w-32 md:w-48">
                <div className="text-xs font-bold text-[#2D1E6F] truncate">{displayName}</div>
                <div className={cn("text-[9px] font-medium flex items-center gap-1", presence.textColor)}>
                  {presence.online ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                  {presence.label}
                </div>
              </div>

              {/* Extended Metrics flex row for wider screen format */}
              <div className="hidden md:flex flex-1 items-center justify-between px-4">
                 <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5 font-bold">Calls</span>
                      <span className="text-xs font-semibold text-gray-700 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-blue-500" />{agent.total_calls}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5 font-bold">WhatsApp</span>
                      <span className="text-xs font-semibold text-gray-700 flex items-center gap-1"><MessageCircle className="w-3 h-3 text-blue-500" />{agent.total_whatsapp || 0}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5 font-bold">Resolved</span>
                      <span className="text-xs font-semibold text-gray-700 flex items-center gap-1"><Users className="w-3 h-3 text-indigo-500" />{agent.tasks_resolved}</span>
                    </div>
                 </div>

                 {targetProgress !== null && (
                   <div className="flex flex-col w-32 mx-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Target</span>
                        <span className="text-[9px] font-bold text-blue-600">{targetProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                         <div className="bg-blue-600 h-1.5 transition-all duration-500" style={{ width: `${targetProgress}%` }} />
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
              
              <div className="text-right shrink-0">
                <div className="text-xs font-bold text-[#2D1E6F]">₹{agent.revenue_recovered.toLocaleString()}</div>
                {conversionRate > 0 && <div className="text-[10px] text-blue-600 font-medium">{conversionRate}% Win Rate</div>}
              </div>
            </div>
          );
        })}
        
        {agents.length === 0 && (
          <div className="px-5 py-8 text-center text-xs text-gray-400 italic">
            No agent performance data available yet.
          </div>
        )}
      </div>
    </div>
  );
};
