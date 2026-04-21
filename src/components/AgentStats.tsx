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
import { Phone, MessageSquare, CheckCircle, TrendingUp, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentStatsProps {
  metrics: {
    total_calls: number;
    total_whatsapp: number;
    tasks_resolved: number;
    revenue_recovered: number;
    weekly_revenue_target: number;
  };
  trendData: any[];
}

export const AgentStats: React.FC<AgentStatsProps> = ({ metrics, trendData }) => {
  const revenueProgress = Math.min(100, ((metrics?.revenue_recovered || 0) / (metrics?.weekly_revenue_target || 1)) * 100);

  const data = [
    { name: 'Calls', value: metrics?.total_calls || 0, color: '#3b82f6' },
    { name: 'WhatsApp', value: metrics?.total_whatsapp || 0, color: '#2D1E6F' },
    { name: 'Resolved', value: metrics?.tasks_resolved || 0, color: '#8b5cf6' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue Progress Card */}
        <div className="card p-4 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue Recovered</p>
              <h3 className="text-2xl font-bold text-[#2D1E6F]">₹{(metrics?.revenue_recovered || 0).toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-gray-400">Target: ₹{(metrics?.weekly_revenue_target || 0).toLocaleString()}</span>
              <span className="font-bold text-blue-600">{revenueProgress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-100 h-1.5 rounded-full">
              <div 
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-1000" 
                style={{ width: `${revenueProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Activity Breakdown */}
        <div className="card p-4 md:col-span-1 lg:col-span-3">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-[#2D1E6F]" />
            <h3 className="text-sm font-bold text-[#2D1E6F]">Activity Breakdown</h3>
          </div>
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={70} tick={{ fontSize: 11, fontWeight: 600 }} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Quick Action Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <Phone className="w-4 h-4 text-blue-500 mb-1" />
          <span className="text-xs font-bold text-blue-700">{metrics.total_calls}</span>
          <span className="text-[9px] text-blue-500/70 font-medium tracking-tight">Calls</span>
        </div>
        <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <MessageSquare className="w-4 h-4 text-blue-500 mb-1" />
          <span className="text-xs font-bold text-blue-700">{metrics.total_whatsapp}</span>
          <span className="text-[9px] text-blue-500/70 font-medium tracking-tight">WhatsApp</span>
        </div>
        <div className="bg-purple-50/50 border border-purple-100 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <CheckCircle className="w-4 h-4 text-purple-500 mb-1" />
          <span className="text-xs font-bold text-purple-700">{metrics.tasks_resolved}</span>
          <span className="text-[9px] text-purple-500/70 font-medium tracking-tight">Closed</span>
        </div>
      </div>
    </div>
  );
};
