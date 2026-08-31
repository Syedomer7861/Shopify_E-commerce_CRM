"use client";
import { useEffect, useState } from "react";
import { TrendingUp, DollarSign, Target, Users, ArrowUpRight, BarChart3, PieChart } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell, Pie, PieChart as RePieChart } from "recharts";
import { isDemoMode } from "@/lib/demo";

export default function RevenueDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Manager Hub allows role === 'manager' through, and the demo persona
    // has always had that role, so this has been reachable from a demo
    // login from the start - just fetching live financial data with no
    // guard. Fake numbers for a demo session instead of real revenue.
    const isDemo = isDemoMode();
    if (isDemo) {
      setData({
        summary: { totalRecovered: 284500, totalPotential: 612000, recoveryRate: 46.5, ndrRate: 38.2 },
        breakdown: {
          recovery: { potential: 320000, recovered: 148000 },
          ndr: { potential: 210000, recovered: 96500 },
          cod: { potential: 82000, recovered: 40000 },
        },
      });
      setLoading(false);
      return;
    }

    fetch("/api/analytics/revenue")
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch revenue analytics:", err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="h-96 flex items-center justify-center animate-pulse text-gray-400 font-bold uppercase tracking-widest text-xs">Calculating ROI...</div>;
  if (!data) return <div className="p-8 text-center text-gray-500">No revenue data available yet.</div>;

  const summaryCards = [
    { label: "Recovered Revenue", value: formatCurrency(data.summary.totalRecovered), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Potential Pipeline", value: formatCurrency(data.summary.totalPotential), icon: Target, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Cart Recovery Rate", value: `${data.summary.recoveryRate.toFixed(1)}%`, icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "NDR Success Rate", value: `${data.summary.ndrRate.toFixed(1)}%`, icon: ArrowUpRight, color: "text-sky-600", bg: "bg-sky-50" },
  ];

  const pieData = [
    { name: "Abandoned Cart", value: data.breakdown.recovery.recovered, color: "#10b981" },
    { name: "NDR Resolution", value: data.breakdown.ndr.recovered, color: "#0ea5e9" },
    { name: "COD Verify", value: data.breakdown.cod.recovered, color: "#f59e0b" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {summaryCards.map((card, idx) => (
          <div key={idx} className="card p-6 flex flex-col justify-between group">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 ${card.bg} ${card.color} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm`}>
                <card.icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black text-[#5f5f5d] uppercase tracking-widest opacity-60">{card.label}</span>
            </div>
            <div className="text-3xl font-black text-[#1c1c1c] tracking-tighter">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recovery Breakdown Chart */}
        <div className="lg:col-span-2 card p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="section-title text-sm mb-1 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#1c1c1c]/40" />
                Recovery Performance
              </h3>
              <p className="text-[10px] text-[#5f5f5d] font-black uppercase tracking-[0.15em] opacity-40">Potential vs Actual Recovered (INR)</p>
            </div>
          </div>
          
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: "Abandoned", potential: data.breakdown.recovery.potential, recovered: data.breakdown.recovery.recovered },
                { name: "NDR", potential: data.breakdown.ndr.potential, recovered: data.breakdown.ndr.recovered },
                { name: "COD", potential: data.breakdown.cod.potential, recovered: data.breakdown.cod.recovered },
              ]} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94a3b8' }} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#1c1c1c] p-4 rounded-xl shadow-2xl border border-white/10">
                          <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">{payload[0].payload.name}</div>
                          <div className="space-y-1">
                            <div className="text-sm font-bold text-white flex items-center justify-between gap-4">
                              <span>Potential:</span>
                              <span>{formatCurrency(payload[0].value as number)}</span>
                            </div>
                            <div className="text-sm font-bold text-emerald-400 flex items-center justify-between gap-4">
                              <span>Recovered:</span>
                              <span>{formatCurrency(payload[1].value as number)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="potential" fill="#f1f5f9" radius={[10, 10, 10, 10]} barSize={40} />
                <Bar dataKey="recovered" fill="#10b981" radius={[10, 10, 10, 10]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue Mix */}
        <div className="card p-8">
           <h3 className="section-title text-sm mb-1 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-[#1c1c1c]/40" />
              Revenue Mix
           </h3>
           <p className="text-[10px] text-[#5f5f5d] font-black uppercase tracking-[0.15em] opacity-40 mb-8">Share of total recovery</p>
           
           <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                 <RePieChart>
                    <Pie
                       data={pieData}
                       innerRadius={60}
                       outerRadius={80}
                       paddingAngle={8}
                       dataKey="value"
                    >
                       {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                       ))}
                    </Pie>
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-[#1c1c1c] p-3 rounded-2xl shadow-xl border border-white/10">
                              <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">{payload[0].name}</p>
                              <p className="text-[11px] font-black text-emerald-400 tabular-nums">{formatCurrency(payload[0].value as number)}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                 </RePieChart>
              </ResponsiveContainer>
           </div>
           
           <div className="space-y-2 mt-4">
              {pieData.map((d, i) => (
                 <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-bold text-gray-600">
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                       {d.name}
                    </div>
                    <div className="font-black text-[#1c1c1c]">{formatCurrency(d.value)}</div>
                 </div>
              ))}
           </div>
        </div>
      </div>

      {/* Agent Recovery Leaderboard */}
      <div className="card p-8">
         <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="section-title text-sm mb-1 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#1c1c1c]/40" />
                Recovery Specialists
              </h3>
              <p className="text-[10px] text-[#5f5f5d] font-black uppercase tracking-[0.15em] opacity-40">Revenue recovered per agent</p>
            </div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="border-b border-gray-100">
                     <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Agent</th>
                     <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Tasks Done</th>
                     <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Revenue Recovered</th>
                     <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Avg Ticket</th>
                  </tr>
               </thead>
               <tbody>
                  {data.agentPerformance.map((agent: any, idx: number) => (
                     <tr key={idx} className="border-b border-gray-50/50 group hover:bg-gray-50/50 transition-colors">
                        <td className="py-4">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-black">
                                 {agent.name.split(" ").map((n: string) => n[0]).join("")}
                              </div>
                              <span className="font-bold text-gray-800">{agent.name}</span>
                           </div>
                        </td>
                        <td className="py-4 text-center">
                           <span className="badge bg-gray-50 text-gray-600 font-black">{agent.count}</span>
                        </td>
                        <td className="py-4 text-right font-black text-emerald-600">
                           {formatCurrency(agent.recovered)}
                        </td>
                        <td className="py-4 text-right font-bold text-gray-400">
                           {formatCurrency(agent.count > 0 ? agent.recovered / agent.count : 0)}
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}
