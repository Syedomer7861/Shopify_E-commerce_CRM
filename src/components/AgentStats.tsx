import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Phone, MessageSquare, CheckCircle, TrendingUp, Target, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentStatsProps {
  metrics: {
    total_calls: number;
    total_whatsapp: number;
    tasks_resolved: number;
    revenue_recovered: number;
    weekly_revenue_target: number;
    today_work_hours?: string;
    today_break_hours?: string;
    current_status?: string;
  };
  trendData: any[];
}

export const AgentStats: React.FC<AgentStatsProps> = ({ metrics, trendData }) => {
  const revenueProgress = Math.min(100, ((metrics?.revenue_recovered || 0) / (metrics?.weekly_revenue_target || 1)) * 100);

  const data = [
    { name: 'Calls', value: metrics?.total_calls || 0, color: '#3b82f6' },
    { name: 'WhatsApp', value: metrics?.total_whatsapp || 0, color: '#1c1c1c' },
    { name: 'Resolved', value: metrics?.tasks_resolved || 0, color: '#8b5cf6' },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Revenue Progress Card */}
        <div className="card p-6 bg-[#f7f4ed] border border-[#eceae4] rounded-3xl shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-black text-[#5f5f5d]/40 uppercase tracking-[0.2em] mb-1">Recovered Revenue</p>
              <h3 className="text-3xl font-black text-[#1c1c1c] tracking-tighter tabular-nums">₹{(metrics?.revenue_recovered || 0).toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-emerald-50 rounded-2xl group-hover:scale-110 transition-transform">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <div className="mt-6">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2">
              <span className="text-[#5f5f5d]/40">TARGET: ₹{(metrics?.weekly_revenue_target || 0).toLocaleString()}</span>
              <span className="text-emerald-600">{revenueProgress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-[#eceae4] h-2 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${revenueProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Attendance Hours Card */}
        <div className="card p-6 bg-[#f7f4ed] border border-[#eceae4] rounded-3xl shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-black text-[#5f5f5d]/40 uppercase tracking-[0.2em] mb-1">Operational Shift</p>
              <h3 className="text-2xl font-black text-[#1c1c1c] tracking-tighter tabular-nums">{metrics?.today_work_hours || "0.0h"} TODAY</h3>
            </div>
            <div className="p-3 bg-blue-50 rounded-2xl group-hover:scale-110 transition-transform">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <div className="flex flex-col">
                <span className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-[0.1em] mb-1">Break Time</span>
                <span className="text-sm font-black text-amber-600 tabular-nums">{metrics?.today_break_hours || "0.0h"}</span>
            </div>
            <div className={cn(
                "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border",
                metrics.current_status === "online" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                ["break", "lunch", "away"].includes(metrics.current_status || "") ? "bg-amber-50 text-amber-700 border-amber-100" :
                "bg-[#eceae4] text-[#1c1c1c]/60 border-[#eceae4]"
            )}>
                {metrics.current_status || "Active"}
            </div>
          </div>
        </div>

        {/* Activity Breakdown */}
        <div className="card p-6 bg-[#f7f4ed] border border-[#eceae4] rounded-3xl shadow-sm md:col-span-1 lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-[#eceae4] rounded-xl">
              <Target className="w-4 h-4 text-[#1c1c1c]/40" />
            </div>
            <h3 className="text-[11px] font-black text-[#1c1c1c] uppercase tracking-[0.2em]">Efficiency Distribution</h3>
          </div>
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eceae4" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  width={90} 
                  tick={{ fontSize: 10, fontWeight: 900, fill: '#1c1c1c', letterSpacing: '0.05em' }}
                  tickFormatter={(val) => val.toUpperCase()}
                />
                <Tooltip 
                  cursor={{ fill: '#eceae4/50' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#1c1c1c] p-3 rounded-2xl shadow-xl border border-white/10">
                          <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">{payload[0].payload.name}</p>
                          <p className="text-[11px] font-black text-white/60 tabular-nums">VALUE : {payload[0].value}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={24}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>


      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#f7f4ed] border border-[#eceae4] p-5 rounded-[24px] flex flex-col items-center justify-center text-center group hover:bg-[#eceae4] transition-all shadow-sm">
          <div className="p-3 bg-blue-50 rounded-2xl mb-3 group-hover:scale-110 transition-transform">
            <Phone className="w-5 h-5 text-blue-600" />
          </div>
          <span className="text-xl font-black text-[#1c1c1c] tracking-tighter tabular-nums mb-1">{metrics.total_calls}</span>
          <span className="text-[10px] text-[#5f5f5d]/40 font-black uppercase tracking-widest">Calls</span>
        </div>
        <div className="bg-[#f7f4ed] border border-[#eceae4] p-5 rounded-[24px] flex flex-col items-center justify-center text-center group hover:bg-[#eceae4] transition-all shadow-sm">
          <div className="p-3 bg-[#1c1c1c]/5 rounded-2xl mb-3 group-hover:scale-110 transition-transform">
            <MessageSquare className="w-5 h-5 text-[#1c1c1c]" />
          </div>
          <span className="text-xl font-black text-[#1c1c1c] tracking-tighter tabular-nums mb-1">{metrics.total_whatsapp}</span>
          <span className="text-[10px] text-[#5f5f5d]/40 font-black uppercase tracking-widest">WhatsApp</span>
        </div>
        <div className="bg-[#f7f4ed] border border-[#eceae4] p-5 rounded-[24px] flex flex-col items-center justify-center text-center group hover:bg-[#eceae4] transition-all shadow-sm">
          <div className="p-3 bg-emerald-50 rounded-2xl mb-3 group-hover:scale-110 transition-transform">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <span className="text-xl font-black text-[#1c1c1c] tracking-tighter tabular-nums mb-1">{metrics.tasks_resolved}</span>
          <span className="text-[10px] text-[#5f5f5d]/40 font-black uppercase tracking-widest">Resolved</span>
        </div>
      </div>
    </div>
  );
};
