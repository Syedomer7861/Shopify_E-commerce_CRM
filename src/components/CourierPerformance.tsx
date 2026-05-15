"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, PieChart, Pie, Legend 
} from "recharts";
import { 
  Truck, AlertTriangle, CheckCircle, Package, 
  RotateCcw, Activity, ShieldAlert, Navigation,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import IndiaSalesMap from "./IndiaSalesMap";

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'];

export default function LogisticsPulse() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncProgress, setSyncProgress] = useState(0);
   const [lastUpdate, setLastUpdate] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const autoSyncStarted = useRef(false);

  const fetchData = useCallback(async (silent = false) => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      if (!silent && !data) setLoading(true);
      setTimeout(() => {
        setData({
          summary: { total: 452, delivered: 310, successRate: 68.5, inTransit: 85, ndr: 42, rto: 15, rtoRate: 3.3 },
          couriers: [
            { name: "Delhivery", total: 156, delivered: 120, rto: 5, successRate: 76.9 },
            { name: "BlueDart", total: 94, delivered: 82, rto: 2, successRate: 87.2 },
            { name: "ExpressBees", total: 112, delivered: 68, rto: 6, successRate: 60.7 },
            { name: "Shadowfax", total: 90, delivered: 40, rto: 2, successRate: 44.4 }
          ],
          statusDistribution: [
            { name: "Delivered", value: 310 },
            { name: "In Transit", value: 85 },
            { name: "NDR", value: 42 },
            { name: "RTO", value: 15 }
          ]
        });
        setLastUpdate(new Date().toLocaleTimeString());
        setLoading(false);
      }, 500);
      return;
    }

    if (!silent && !data) setLoading(true);
    try {
      const res = await fetch(`/api/analytics/couriers?t=${Date.now()}`);
      const d = await res.json();
      if (!res.ok || d.error) {
        console.error("[CourierPerformance] API returned an error:", d);
      }
      setData(d);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("[CourierPerformance] background fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    setMounted(true);
    const init = async () => {
      await fetchData();
      // If no data exists, trigger auto-sync
      if (!autoSyncStarted.current && !loading) {
        // We check data in the next tick to ensure state is updated
      }
    };
    init();
  }, [fetchData, loading]);

  const lastRefreshProgress = useRef(0);
  
  const handleSync = useCallback(async () => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setSyncing(true);
      setSyncMessage("Demo: Connecting to Shiprocket...");
      setSyncProgress(20);
      
      setTimeout(() => {
        setSyncMessage("Demo: Syncing logistics intelligence...");
        setSyncProgress(65);
        setTimeout(() => {
          setSyncMessage("Demo: Pipeline synchronized!");
          setSyncProgress(100);
          fetchData(true);
          setTimeout(() => {
            setSyncing(false);
            setSyncMessage("");
            setSyncProgress(0);
          }, 1500);
        }, 1500);
      }, 1500);
      return;
    }

    setSyncing(true);
    setSyncMessage("Connecting to Shiprocket...");
    lastRefreshProgress.current = 0;
    try {
      const response = await fetch('/api/sync/shiprocket?stream=true');
      if (!response.ok) throw new Error("Sync failed");
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Could not initialize stream");
      
      const decoder = new TextDecoder();
      
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last partial line in the buffer
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          const jsonString = trimmedLine.startsWith("data: ") 
            ? trimmedLine.slice(6) 
            : trimmedLine;

          try {
            const data = JSON.parse(jsonString);
            if (data.message) {
              setSyncMessage(data.message);
            }
            if (data.progress !== undefined) {
              setSyncProgress(data.progress);
              
              // Resilient Refresh Logic:
              // Refresh every 10% of progress, or if we just started (10%), or just finished (100%)
              // Refresh every 5% for better responsiveness
              const progressDiff = data.progress - lastRefreshProgress.current;
              if (progressDiff >= 5 || (data.progress >= 99 && lastRefreshProgress.current < 99)) {
                fetchData(true);
                lastRefreshProgress.current = data.progress;
              }
            }
            if (data.error) {
              throw new Error(data.error);
            }
          } catch (e) {
            console.error("Parse error in stream line:", e);
          }
        }
      }
      
      setSyncMessage("Sync complete. Updating metrics...");
      await fetchData(true);
    } catch (err: any) {
      setSyncMessage(err.message || "Sync failed. Please try again.");
    } finally {
      setTimeout(() => {
        setSyncing(false);
        setSyncMessage("");
        setSyncProgress(0);
      }, 3000);
    }
  }, [fetchData]);

  // Watch for data availability to trigger auto-sync
  useEffect(() => {
    if (!loading && (!data || !data.summary || data.summary.total === 0) && !syncing && !autoSyncStarted.current) {
      autoSyncStarted.current = true;
      handleSync();
    }
  }, [loading, data, syncing, handleSync]);

  // Determine if we should show the empty state vs the dashboard
  const showEmptyState = (!data || !data.summary || data.summary.total === 0) && !syncing;

  if (loading && !data && !syncing) return (
    <div className="h-[400px] flex flex-col items-center justify-center space-y-6 bg-[#f7f4ed] rounded-[32px] border border-[#eceae4] shadow-sm">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-[#eceae4] rounded-full"></div>
        <div className="absolute inset-0 border-4 border-[#1c1c1c] border-t-transparent rounded-full animate-spin"></div>
      </div>
      <div className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-[0.3em] animate-pulse">Aggregating Logistics Intelligence...</div>
    </div>
  );

  // Background Sync Header (always visible if syncing)
  const SyncHeader = syncing && (
    <div className="mb-6 p-6 bg-[#1c1c1c] rounded-[32px] text-[#f7f4ed] shadow-2xl shadow-[#1c1c1c]/20 animate-in slide-in-from-top duration-500 relative overflow-hidden border border-[#1c1c1c]">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#f7f4ed]/5 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-[#f7f4ed]/10 flex items-center justify-center backdrop-blur-md">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f7f4ed]/40 mb-1">Live Pipeline Synchronization</div>
            <div className="text-sm font-black truncate max-w-[200px] md:max-w-md tracking-tight">{syncMessage || "Fetching new intelligence..."}</div>
          </div>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-right hidden md:block">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f7f4ed]/40 mb-1">Process Saturation</div>
            <div className="text-sm font-black tabular-nums tracking-tighter">{Math.round(syncProgress)}%</div>
          </div>
          <div className="w-14 h-14 relative flex items-center justify-center">
            <svg className="w-full h-full -rotate-90">
              <circle cx="28" cy="28" r="24" fill="none" stroke="white" strokeWidth="4" className="opacity-10" />
              <circle cx="28" cy="28" r="24" fill="none" stroke="#3b82f6" strokeWidth="4" strokeDasharray={150.8} strokeDashoffset={150.8 - (150.8 * syncProgress / 100)} className="transition-all duration-500" />
            </svg>
            <span className="absolute text-[10px] font-black">{Math.round(syncProgress)}%</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (showEmptyState) return (
    <div className="h-[500px] flex flex-col items-center justify-center text-center p-12 bg-[#f7f4ed] rounded-[48px] border-2 border-dashed border-[#eceae4] group transition-all hover:border-blue-200 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/20 via-transparent to-indigo-50/20 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
      
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-24 h-24 bg-[#eceae4] rounded-[32px] flex items-center justify-center mb-10 group-hover:scale-110 group-hover:rotate-3 transition-all duration-700 shadow-xl border border-[#eceae4]">
          <Truck className="w-12 h-12 text-[#1c1c1c] animate-pulse-slow" />
        </div>
        <h3 className="text-4xl font-black text-[#1c1c1c] uppercase tracking-tighter mb-4 group-hover:text-blue-900 transition-colors">Logistics Intelligence</h3>
        <p className="text-[11px] text-[#5f5f5d] font-black max-w-sm mb-12 leading-relaxed uppercase tracking-[0.2em]">
          Synchronize your Shiprocket ecosystem to activate real-time delivery audits and courier performance matrices.
        </p>
        
        <button 
          onClick={handleSync}
          className="relative group/btn px-16 py-6 rounded-2xl bg-[#1c1c1c] text-[#f7f4ed] font-black text-[11px] uppercase tracking-[0.4em] transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-[#1c1c1c]/20 overflow-hidden"
        >
          <div className="relative z-10 flex items-center gap-4">
            <Activity className="w-4 h-4" />
            <span>Initialize Pipeline</span>
          </div>
        </button>
      </div>
    </div>
  );

  // Default values if data is still being fetched during sync
  const summary = data?.summary || { total: 0, delivered: 0, successRate: 0, inTransit: 0, ndr: 0, rto: 0, rtoRate: 0 };
  const couriers = data?.couriers || [];
  const statusDistribution = data?.statusDistribution || [];

  return (
    <div className="space-y-8">
      {SyncHeader}

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
             <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-[0.2em]">Real-Time Observability</span>
          </div>
          {lastUpdate && (
             <span className="text-[10px] font-black text-[#5f5f5d]/40 bg-[#eceae4] px-3 py-1 rounded-lg border border-[#eceae4]">
                REFRESH: {mounted ? lastUpdate : "---"}
             </span>
          )}
        </div>
        {syncing && (
           <div className="flex flex-col items-end gap-1.5">
              <span className="text-[10px] font-black text-blue-600 animate-pulse tracking-tighter uppercase">
                 STREAMING LIVE INTELLIGENCE
              </span>
              {data?.debug && (
                <span className="text-[9px] font-black text-[#5f5f5d]/40 bg-[#eceae4] px-2.5 py-1 rounded-lg border border-[#eceae4]">
                  PIPELINE: {data.debug.rawCount} PAYLOADS
                </span>
              )}
           </div>
        )}
      </div>

      {data?.error && (
         <div className="mx-2 p-5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-widest overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
            [API EXCEPTION]: {typeof data.error === 'object' ? JSON.stringify(data.error, null, 2) : String(data.error)}
            {data?.rawError && <div className="mt-2 opacity-60">RAW_TRACE: {JSON.stringify(data.rawError)}</div>}
         </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <PulseMetric 
          label="Total Orders" 
          value={summary.total} 
          icon={Package} 
          accent="text-[#1c1c1c]"
        />
        <PulseMetric 
          label="Delivered" 
          value={summary.delivered} 
          icon={CheckCircle} 
          accent="text-emerald-600"
          sub={`${summary.successRate.toFixed(1)}% SUCCESS`}
        />
        <PulseMetric 
          label="In-Transit" 
          value={summary.inTransit} 
          icon={Navigation} 
          accent="text-blue-600"
        />
        <PulseMetric 
          label="NDR Risk" 
          value={summary.ndr} 
          icon={ShieldAlert} 
          accent="text-amber-600"
        />
        <PulseMetric 
          label="RTO / Lost" 
          value={summary.rto} 
          icon={RotateCcw} 
          accent="text-rose-600"
          sub={`${summary.rtoRate.toFixed(1)}% RATE`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Courier Bar Chart */}
        <div className="card p-8 space-y-8 bg-[#f7f4ed] border border-[#eceae4] rounded-[32px] shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-black text-[#1c1c1c] flex items-center gap-3 uppercase tracking-[0.2em]">
              <div className="p-2 bg-[#eceae4] rounded-xl">
                <Truck className="w-4 h-4 text-[#1c1c1c]/40" />
              </div>
              Courier Performance Audit
            </h3>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-[9px] font-black text-[#5f5f5d]/40 uppercase tracking-widest">High</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-[9px] font-black text-[#5f5f5d]/40 uppercase tracking-widest">Critical</span>
              </div>
            </div>
          </div>

          <div className="w-full" style={{ height: `${Math.max(350, couriers.length * 50)}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={couriers} layout="vertical" margin={{ left: 20, right: 40, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eceae4" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  tick={{ fontSize: 10, fontWeight: 900, fill: '#1c1c1c', letterSpacing: '0.05em' }}
                  width={160}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  cursor={{ fill: '#eceae4/40' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-[#1c1c1c] p-5 rounded-2xl border border-[#1c1c1c] shadow-2xl text-[10px] text-[#f7f4ed]">
                          <div className="font-black uppercase tracking-[0.2em] mb-3 pb-2 border-b border-white/10">{d.name}</div>
                          <div className="space-y-2">
                            <div className="flex justify-between gap-8 opacity-40 uppercase font-black">
                              <span>Total Loads:</span>
                              <span className="text-[#f7f4ed] tabular-nums">{d.total}</span>
                            </div>
                            <div className="flex justify-between gap-8 text-emerald-400 uppercase font-black">
                              <span>Delivered:</span>
                              <span className="tabular-nums">{d.delivered}</span>
                            </div>
                            <div className="flex justify-between gap-8 text-rose-400 uppercase font-black">
                              <span>RTO Count:</span>
                              <span className="tabular-nums">{d.rto}</span>
                            </div>
                            <div className="pt-2 border-t border-white/10 flex justify-between gap-8 font-black uppercase text-blue-400">
                              <span>Success Rate:</span>
                              <span className="tabular-nums">{d.successRate.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="successRate" radius={[0, 8, 8, 0]} barSize={24}>
                  {couriers.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.successRate > 70 ? '#10b981' : entry.successRate > 50 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Donut Chart */}
        <div className="card p-8 space-y-8 bg-[#f7f4ed] border border-[#eceae4] rounded-[32px] shadow-sm flex flex-col">
          <h3 className="text-[11px] font-black text-[#1c1c1c] flex items-center gap-3 uppercase tracking-[0.2em]">
            <div className="p-2 bg-[#eceae4] rounded-xl">
              <Activity className="w-4 h-4 text-emerald-600" />
            </div>
            Operational Lifecycle
          </h3>
          
          <div className="flex-1 min-h-[350px] flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={8}
                  dataKey="value"
                  stroke="none"
                >
                  {statusDistribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#1c1c1c] p-3 rounded-2xl shadow-xl border border-white/10">
                          <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">{payload[0].name}</p>
                          <p className="text-[11px] font-black text-blue-400 tabular-nums">ORDERS : {payload[0].value}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={48}
                  formatter={(value) => <span className="text-[10px] font-black uppercase text-[#5f5f5d]/60 tracking-widest">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
            
            <div className="mt-10 grid grid-cols-2 gap-6 w-full">
              <div className="p-6 rounded-[24px] bg-emerald-50/50 border border-emerald-100/50">
                 <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Fulfilled</div>
                 <div className="text-3xl font-black text-emerald-700 tracking-tighter tabular-nums">{summary.delivered}</div>
              </div>
              <div className="p-6 rounded-[24px] bg-rose-50/50 border border-rose-100/50">
                 <div className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2">Returned</div>
                 <div className="text-3xl font-black text-rose-700 tracking-tighter tabular-nums">{summary.rto}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function PulseMetric({ label, value, icon: Icon, accent, sub }: any) {
  return (
    <div className="card p-5 bg-[#f7f4ed] border border-[#eceae4] rounded-3xl hover:bg-[#eceae4] transition-all group shadow-sm active:scale-[0.98]">
      <div className="flex items-center gap-4 mb-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-110", accent.replace('text-', 'bg-').replace('-600', '-50'))}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-[10px] font-black text-[#5f5f5d]/40 uppercase tracking-[0.15em] leading-tight">{label}</span>
      </div>
      <div className="flex items-baseline gap-3">
        <div className={cn("text-2xl font-black tracking-tighter tabular-nums", accent)}>{value}</div>
        {sub && <div className="text-[10px] font-black text-[#5f5f5d]/40 uppercase tracking-tighter">{sub}</div>}
      </div>
    </div>
  );
}
