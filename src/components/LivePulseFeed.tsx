"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { timeAgo, cn } from "@/lib/utils";
import { Activity, Zap, ShoppingBag, CheckCircle2, AlertTriangle, User, RefreshCw } from "lucide-react";

export default function LivePulseFeed({ initialLogs = [] }: { initialLogs?: any[] }) {
  const [logs, setLogs] = useState<any[]>(initialLogs);
  const supabase = createClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setLogs([
        { id: 'm1', source: 'shopify', topic: 'order_paid', created_at: new Date(Date.now() - 60000).toISOString(), payload: { data: { customer_name: 'Rahul Kumar', total_price: '₹2,450' } } },
        { id: 'm2', activity_type: 'call_logged', created_at: new Date(Date.now() - 300000).toISOString(), description: 'Rahul called Amit about Order #1234' },
        { id: 'm3', source: 'shiprocket', topic: 'order_shipped', created_at: new Date(Date.now() - 600000).toISOString(), payload: { data: { customer_name: 'Priya Singh' } } },
        { id: 'm4', activity_type: 'status_change', created_at: new Date(Date.now() - 1200000).toISOString(), description: 'Agent Amit changed status to Online' },
      ]);
      return;
    }

    // 1. Subscribe to Webhook Logs (System Pulse)
    const webhookSub = supabase
      .channel("live_webhooks")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "webhook_logs" },
        (payload) => {
          setLogs((prev) => [payload.new, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    // 2. Subscribe to Agent Activity Logs (Human Pulse)
    const activitySub = supabase
      .channel("live_agent_activity")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_activity_logs" },
        (payload) => {
          setLogs((prev) => [payload.new, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    // 3. Subscribe to Call Logs (Automation Pulse)
    const callSub = supabase
      .channel("live_calls")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_logs" },
        (payload) => {
          setLogs((prev) => [payload.new, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(webhookSub);
      supabase.removeChannel(activitySub);
      supabase.removeChannel(callSub);
    };
  }, [supabase]);

  const getLogDetails = (log: any) => {
    // Webhook Log Structure
    if (log.source === "shopify" || log.source === "shiprocket" || log.topic) {
      const data = log.payload?.data || log.payload?.payload || log.payload;
      const topic = log.topic || "Event";
      const name = data?.customer_name || data?.first_name || data?.email || "System";
      
      return {
        title: topic.replace(/_/g, ' '),
        subtitle: name,
        type: "system",
        icon: topic.includes("order") ? <ShoppingBag className="w-3 h-3" /> : <Zap className="w-3 h-3" />,
        color: topic.includes("order") ? "bg-emerald-500" : "bg-amber-500"
      };
    }
    
    // Call Log Structure (Check for System/Automation)
    if (log.outcome || log.note) {
      const isAuto = log.agent_name?.toLowerCase().includes("system");
      return {
        title: log.outcome || "Call Log",
        subtitle: log.note || "New update",
        type: isAuto ? "auto" : "manual",
        icon: isAuto ? <Zap className="w-3 h-3" /> : <User className="w-3 h-3" />,
        color: isAuto ? "bg-amber-500" : "bg-[#1c1c1c]",
        badge: isAuto ? "AUTO" : "MANUAL"
      };
    }

    // Agent Activity Log Structure
    return {
      title: log.activity_type?.replace(/_/g, ' ') || "Activity",
      subtitle: log.description || log.metadata?.agent_email || "Agent Action",
      type: "manual",
      icon: <User className="w-3 h-3" />,
      color: "bg-[#1c1c1c]",
      badge: "MANUAL"
    };
  };

  return (
    <div className="animate-in slide-in-from-right-8 duration-700">
      <div className="flex items-center justify-between mb-5 px-1">
        <h2 className="text-[11px] font-black text-[#1c1c1c] flex items-center gap-3 uppercase tracking-[0.2em]">
          <div className="p-2 bg-[#eceae4] rounded-xl">
            <Activity className="w-4 h-4 text-[#1c1c1c]/40" />
          </div>
          Live Intelligence Stream
        </h2>
        <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100/50">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Observable</span>
        </div>
      </div>
      
      <div className="card bg-[#f7f4ed] border border-[#eceae4] rounded-[32px] overflow-hidden shadow-sm">
        <div className="divide-y divide-[#eceae4]/40">
          {logs.map((log, i) => {
            const details = getLogDetails(log);
            return (
              <div 
                key={log.id || i} 
                className="px-6 py-4 flex items-start gap-4 transition-all duration-300 hover:bg-[#eceae4] group animate-in fade-in slide-in-from-top-2"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className={cn(
                  "mt-1 w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0 transition-transform group-hover:scale-110",
                  details.color
                )}>
                  {details.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest truncate">
                      {details.title}
                    </span>
                    <span className="text-[9px] text-[#5f5f5d]/30 font-black uppercase whitespace-nowrap">
                      {mounted ? timeAgo(log.created_at) : "—"}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#5f5f5d] font-bold truncate mt-1 opacity-60 group-hover:opacity-100 transition-opacity flex items-center justify-between">
                    <span>{details.subtitle}</span>
                    {details.badge && (
                      <span className={cn(
                        "ml-2 text-[7px] font-black px-1.5 py-0.5 rounded-md border",
                        details.type === "auto" || details.type === "system" ? "bg-amber-50 border-amber-100 text-amber-700" : "bg-gray-50 border-gray-100 text-gray-500"
                      )}>
                        {details.badge}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {logs.length === 0 && (
            <div className="px-6 py-16 text-center bg-[#f7f4ed]">
              <div className="flex justify-center mb-4">
                 <div className="p-4 bg-[#eceae4] rounded-2xl">
                    <RefreshCw className="w-6 h-6 text-[#1c1c1c]/20 animate-spin-slow" />
                 </div>
              </div>
              <div className="text-[10px] text-[#1c1c1c] font-black uppercase tracking-[0.2em]">Monitoring Pipeline</div>
              <div className="text-[9px] text-[#5f5f5d]/40 mt-2 font-bold uppercase tracking-widest italic">Waiting for incoming telemetry...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
