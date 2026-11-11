"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { isDemoMode } from "@/lib/demo";
import { 
  Users, UserCheck, Clock, TrendingUp, History, 
  Search, Calendar, Filter, Eye, Phone, CheckCircle, 
  XCircle, Zap, ShieldCheck, Download, BarChart3,
  ArrowUpRight, ArrowDownRight, Smartphone, MessageSquare, MousePointer2
} from "lucide-react";
import { Avatar, SectionTitle, Modal, BarRow } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import toast from "react-hot-toast";
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, AreaChart, Area, Cell, PieChart, Pie
} from "recharts";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { AgentDetailsModal } from "./AgentDetailsModal";


interface AgentIntelligenceProps {
  onRefresh?: () => void;
}

export default function AgentIntelligence({ onRefresh }: AgentIntelligenceProps) {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 0), "yyyy-MM-dd"), // Default to today
    end: format(new Date(), "yyyy-MM-dd")
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<any>(null);

  const [data, setData] = useState<any>({
    agents: [],
    dailyLogs: [],
    recentActivity: []
  });

  // Supabase client for live content sync
  const supabase = useMemo(() => {
    const { createClient } = require("@/lib/supabase");
    return createClient();
  }, []);

  const { profile: currentProfile } = useCurrentProfile();

  const fetchData = useCallback(async (silent = false) => {
    const isDemo = isDemoMode();
    if (isDemo) {
      if (!silent) setLoading(true);
      setTimeout(() => {
        setData({
          agents: [
            { id: '1', name: 'Agent Rahul', email: 'rahul@cureforever.com', status: 'online', taskCount: 42, revenue: 85000, productivity: '6.2', onlineHours: '06:45', breakHours: '00:45', onlineSeconds: 24300 },
            { id: '2', name: 'Agent Priya', email: 'priya@cureforever.com', status: 'break', taskCount: 28, revenue: 42000, productivity: '4.8', onlineHours: '05:15', breakHours: '01:15', lastReason: 'Lunch', onlineSeconds: 18900 },
            { id: '3', name: 'Agent Amit', email: 'amit@cureforever.com', status: 'online', taskCount: 56, revenue: 112000, productivity: '7.5', onlineHours: '07:30', breakHours: '00:30', onlineSeconds: 27000 },
            { id: '4', name: 'Agent Sneha', email: 'sneha@cureforever.com', status: 'offline', taskCount: 22, revenue: 35000, productivity: '4.2', onlineHours: '04:45', breakHours: '00:45', onlineSeconds: 17100 }
          ],
          dailyLogs: [
            { date: '2026-05-14', name: 'Agent Rahul', email: 'rahul@cureforever.com', status: 'Present', clockIn: '09:00', clockOut: '18:00', netHours: '8.5', tasks: 42, revenue: 85000 },
            { date: '2026-05-14', name: 'Agent Amit', email: 'amit@cureforever.com', status: 'Present', clockIn: '09:15', clockOut: '18:15', netHours: '8.2', tasks: 56, revenue: 112000 }
          ],
          recentActivity: [
            { id: 'a1', profile: { name: 'Agent Rahul' }, activity_type: 'whatsapp', created_at: new Date().toISOString(), metadata: { description: 'Sent recovery message to customer' } },
            { id: 'a2', profile: { name: 'Agent Amit' }, activity_type: 'call', created_at: new Date(Date.now() - 600000).toISOString(), metadata: { description: 'Resolved NDR exception' } },
            { id: 'a3', profile: { name: 'Agent Priya' }, activity_type: 'login', created_at: new Date(Date.now() - 3600000).toISOString(), metadata: { description: 'Shift Started' } }
          ]
        });
        setLoading(false);
      }, 600);
      return;
    }

    if (!silent) setLoading(true);
    try {
      const start = startOfDay(new Date(dateRange.start)).toISOString();
      const end = endOfDay(new Date(dateRange.end)).toISOString();
      
      const res = await fetch(`/api/admin/analytics/agents?start=${start}&end=${end}`);
      const json = await res.json();
      
      if (json.success) {
        // Filter: HR should not see Admins. Only Admins see everyone.
        const filteredAgents = json.data.filter((a: any) => {
          if (currentProfile?.role?.toLowerCase() === 'admin') return true;
          return a.role?.toLowerCase() !== 'admin';
        });
        
        const agentEmails = new Set(filteredAgents.map((a: any) => a.email.toLowerCase()));
        const agentIds = new Set(filteredAgents.map((a: any) => a.id));

        setData({
          agents: filteredAgents,
          dailyLogs: json.dailyLogs.filter((l: any) => agentEmails.has(l.email?.toLowerCase())),
          recentActivity: json.recentActivity.filter((r: any) => agentIds.has(r.agent_id))
        });
      }
    } catch (err) {
      console.error("Failed to fetch agent intelligence:", err);
      if (!silent) toast.error("Failed to sync agent data");
    } finally {
      setLoading(false);
    }
  }, [dateRange.start, dateRange.end, currentProfile]);

  useEffect(() => {
    fetchData();
    // Background refresh: silent = no skeleton flash, no error toast while the
    // manager is reading the panel. Also pauses when the tab is hidden.
    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchData(true);
    }, 3 * 60000);
    
    return () => {
      if (typeof pollInterval !== "undefined") clearInterval(pollInterval);
    };
  }, [fetchData]);





  const filteredAgents = useMemo(() => {
    return data.agents.filter((a: any) => 
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      a.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data.agents, searchTerm]);

  const stats = useMemo(() => {
    const totalTasks = data.agents.reduce((acc: number, a: any) => acc + (a.taskCount || 0), 0);
    const totalRevenue = data.agents.reduce((acc: number, a: any) => acc + (a.revenue || 0), 0);
    const onlineCount = data.agents.filter((a: any) => a.status === 'online').length;
    const avgProductivity = data.agents.length > 0 
      ? (data.agents.reduce((acc: number, a: any) => acc + Number(a.productivity || 0), 0) / data.agents.length).toFixed(1)
      : "0.0";

    return { totalTasks, totalRevenue, onlineCount, avgProductivity };
  }, [data.agents]);

  const formatMins = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#fcfbf8] p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-[#1c1c1c] tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1c1c1c] text-white rounded-2xl flex items-center justify-center shadow-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            Agent Intelligence Center
          </h2>
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.2em] ml-13">Telemetry & Performance Audit</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white p-1 rounded-xl border border-gray-100 shadow-inner">
            <input 
              type="date" 
              className="text-[10px] font-black uppercase tracking-wider px-3 py-2 border-none focus:ring-0 bg-transparent"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            />
            <div className="w-[1px] bg-gray-100 my-2" />
            <input 
              type="date" 
              className="text-[10px] font-black uppercase tracking-wider px-3 py-2 border-none focus:ring-0 bg-transparent"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            />
          </div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="btn-primary py-3 px-6 text-[10px] font-black uppercase tracking-widest gap-2"
          >
            {loading ? <Zap className="w-3 h-3 animate-pulse" /> : <Zap className="w-3 h-3" />}
            Sync Live
          </button>
        </div>
      </div>

      {/* Metric Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          label="Active Strength" 
          value={stats.onlineCount} 
          icon={UserCheck} 
          sub="Agents currently online"
          accent="text-emerald-600"
        />
        <MetricCard 
          label="Cumulative Tasks" 
          value={stats.totalTasks} 
          icon={Zap} 
          sub="Across selected range" 
          accent="text-[#1c1c1c]"
        />
        <MetricCard 
          label="Attributed Rev" 
          value={formatCurrency(stats.totalRevenue)} 
          icon={TrendingUp} 
          sub="Direct agent conversions" 
          accent="text-emerald-600"
        />
        <MetricCard 
          label="Avg Efficiency" 
          value={`${stats.avgProductivity} T/H`} 
          icon={BarChart3} 
          sub="Tasks per active hour" 
          accent="text-amber-600"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Agent Performance Table */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest flex items-center gap-2">
              <Users className="w-4 h-4" /> Agent Leaderboard
            </h3>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Filter by name..." 
                className="pl-9 pr-4 py-2 text-[10px] font-bold border-gray-100 rounded-xl focus:ring-[#1c1c1c] bg-[#fcfbf8] w-48"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="card overflow-x-auto border border-gray-100 shadow-xl shadow-gray-200/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#fcfbf8] border-b border-gray-100">
                  <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Agent</th>
                  <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Live Status</th>
                  <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Work/Break</th>
                  <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Output</th>
                  <th className="px-3 py-4 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Revenue</th>
                  <th className="px-3 py-4 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredAgents.map((agent: any) => (
                  <tr key={agent.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={agent.name} size="sm" />
                        <div>
                          <div className="text-[11px] font-black text-[#1c1c1c] tracking-tight">{agent.name}</div>
                          <div className="text-[9px] font-bold text-gray-400 truncate max-w-[120px]">{agent.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full animate-pulse",
                            agent.status === 'online' ? 'bg-emerald-500' : agent.status === 'break' ? 'bg-amber-500' : 'bg-gray-300'
                          )} />
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-wider",
                            agent.status === 'online' ? 'text-emerald-600' : agent.status === 'break' ? 'text-amber-600' : 'text-gray-400'
                          )}>{agent.status || 'Offline'}</span>
                        </div>
                        {agent.liveState && agent.status !== 'offline' && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded animate-pulse">LIVE</span>
                            <span className="text-[8px] font-bold text-gray-500 truncate max-w-[80px]">{agent.liveState.action}</span>
                          </div>
                        )}
                        {agent.lastReason && <span className="text-[8px] text-gray-400 italic">&ldquo;{agent.lastReason}&rdquo;</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-center">
                         <div className="flex flex-wrap gap-2 sm:gap-3 mb-1">
                            <div className="text-center">
                               <div className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Online</div>
                               <div className="text-[10px] font-black text-[#1c1c1c]">{agent.onlineHours}</div>
                            </div>
                            <div className="text-center">
                               <div className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Break</div>
                               <div className="text-[10px] font-black text-rose-500">{agent.breakHours}</div>
                            </div>
                         </div>
                         <div className="w-20 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#1c1c1c] transition-all duration-1000" 
                              style={{ width: `${Math.min(100, (agent.onlineSeconds / 28800) * 100)}%` }} // 8h target
                            />
                         </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <div className="text-[11px] font-black text-[#1c1c1c]">{agent.taskCount}</div>
                        <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{agent.productivity} T/H</div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-right">
                      <div className="text-[11px] font-black text-emerald-600">{formatCurrency(agent.revenue)}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <button 
                          onClick={() => setSelectedAgent(agent)}
                          className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 hover:bg-[#1c1c1c] hover:text-white rounded-md transition-all text-[10px] font-bold"
                          title="View Performance"
                        >
                          <Eye className="w-3 h-3" /> Details
                        </button>

                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Daily Performance Grid */}
          <div className="pt-8 space-y-4">
            <h3 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest flex items-center gap-2 px-2">
              <Calendar className="w-4 h-4" /> Daily Performance Ledger
            </h3>
            <div className="card border border-gray-100 overflow-hidden">
               <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#fcfbf8] z-20 shadow-sm">
                      <tr className="border-b border-gray-100">
                        <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                        <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Agent</th>
                        <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                        <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Login/Logout</th>
                        <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Net Hours</th>
                        <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Tasks</th>
                        <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.dailyLogs.map((log: any, i: number) => (
                        <tr key={i} className="hover:bg-gray-50/50">
                          <td className="px-6 py-3 text-[10px] font-bold text-[#1c1c1c]">{log.date}</td>
                          <td className="px-6 py-3 text-[10px] font-black text-[#1c1c1c] uppercase tracking-tighter">{log.name}</td>
                          <td className="px-6 py-3">
                             <span className={cn(
                               "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
                               log.status === 'Present' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                             )}>
                               {log.status}
                             </span>
                          </td>
                          <td className="px-6 py-3 text-center text-[10px] font-bold text-gray-500">
                            {log.clockIn} — {log.clockOut}
                          </td>
                          <td className="px-6 py-3 text-center text-[10px] font-black text-[#1c1c1c]">{log.netHours}</td>
                          <td className="px-6 py-3 text-center text-[10px] font-black text-[#1c1c1c]">{log.tasks}</td>
                          <td className="px-6 py-3 text-right text-[10px] font-black text-emerald-600">{formatCurrency(log.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </div>
          </div>
        </div>

        {/* Live Activity & Insights */}
        <div className="space-y-6">
          <div className="card p-6 border-none shadow-xl shadow-gray-200/40 bg-gradient-to-b from-white to-[#fcfbf8]">
            <h3 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest mb-6 flex items-center gap-2">
              <History className="w-4 h-4" /> Live Action Stream
            </h3>
            <div className="space-y-5">
              {data.recentActivity.slice(0, 10).map((log: any, i: number) => (
                <div key={log.id} className="flex gap-3 relative pb-5 last:pb-0">
                  {i < 9 && <div className="absolute left-[7px] top-4 bottom-0 w-[2px] bg-gray-50" />}
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 border-white shadow-sm shrink-0 z-10 mt-0.5 flex items-center justify-center",
                    log.activity_type === 'whatsapp' ? 'bg-emerald-500' : 
                    log.activity_type === 'call' ? 'bg-[#1c1c1c]' : 
                    log.activity_type === 'login' ? 'bg-blue-500' : 'bg-amber-500'
                  )}>
                    {log.activity_type === 'whatsapp' && <MessageSquare className="w-2 h-2 text-white" />}
                    {log.activity_type === 'call' && <Phone className="w-2 h-2 text-white" />}
                    {log.activity_type === 'login' && <UserCheck className="w-2 h-2 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-black text-[#1c1c1c] truncate">{log.profile?.name}</span>
                      <span className="text-[8px] font-bold text-gray-400 whitespace-nowrap">{format(new Date(log.created_at), "HH:mm")}</span>
                    </div>
                    <div className="text-[9px] text-gray-500 leading-tight">
                      <span className="font-bold text-[#1c1c1c] uppercase tracking-tighter">{log.activity_type.replace('_', ' ')}</span>
                      {log.metadata?.description && ` — ${log.metadata.description}`}
                      {(log.metadata?.order_id || log.metadata?.cart_id) && (
                        <div className="mt-1 flex items-center gap-2">
                           <button 
                             onClick={() => {
                               const type = log.metadata.order_id ? 'order' : 'cart';
                               const id = log.metadata.order_id || log.metadata.cart_id;
                               window.open(type === 'order' ? `/orders?id=${id}` : `/tasks?id=${id}`, '_blank');
                             }}
                             className="text-[8px] font-black text-emerald-600 hover:underline uppercase flex items-center gap-1"
                           >
                              <ArrowUpRight className="w-2 h-2" /> View {log.metadata.order_id ? 'Order' : 'Cart'}
                           </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {data.recentActivity.length === 0 && (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <History className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold italic">No live actions recorded</p>
                </div>
              )}
            </div>
          </div>

          <div className="card p-6 bg-[#1c1c1c] text-white overflow-hidden relative">
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <Zap className="w-32 h-32 text-white" />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-4">Daily Efficiency Mix</h3>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailyLogs.slice(0, 10).reverse()}>
                  <defs>
                    <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fff" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#fff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1c1c1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="tasks" 
                    stroke="#fff" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#colorTasks)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center justify-between">
               <div>
                  <div className="text-xl font-black">{stats.totalTasks}</div>
                  <div className="text-[8px] font-black uppercase tracking-widest opacity-40">System Velocity</div>
               </div>
               <div className="text-right">
                  <div className="text-xl font-black">{stats.avgProductivity}</div>
                  <div className="text-[8px] font-black uppercase tracking-widest opacity-40">Avg T/H</div>
               </div>
            </div>
          </div>
        </div>
      </div>

      <AgentDetailsModal 
        agent={selectedAgent} 
        onClose={() => setSelectedAgent(null)} 
        recentActivity={data.recentActivity}
      />


    </div>
  );
}

function MetricCard({ label, value, icon: Icon, sub, accent = "text-[#1c1c1c]", trend }: any) {
  return (
    <div className="card p-6 relative overflow-hidden group hover:shadow-xl transition-all duration-500 border border-transparent hover:border-gray-100 bg-white">
      <div className="flex justify-between items-start mb-3">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{label}</p>
          <div className="flex items-baseline gap-2">
            <h3 className={cn("text-3xl font-black tracking-tighter", accent)}>{value}</h3>
            {trend && <span className="text-[10px] font-black text-emerald-500 flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3" /> {trend}</span>}
          </div>
        </div>
        <div className="p-3 bg-[#fcfbf8] rounded-2xl group-hover:bg-[#1c1c1c] group-hover:text-white transition-all duration-500 scale-110 shadow-sm border border-gray-50">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-[10px] text-gray-400 font-bold truncate opacity-80 mt-3 uppercase tracking-widest">{sub}</p>
    </div>
  );
}
