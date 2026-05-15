"use client";
import { Modal, Avatar } from "@/components/ui";
import { History } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface AgentDetailsModalProps {
  agent: any;
  onClose: () => void;
  recentActivity: any[];
}

export function AgentDetailsModal({ agent, onClose, recentActivity }: AgentDetailsModalProps) {
  if (!agent) return null;

  return (
    <Modal 
      open={!!agent} 
      onClose={onClose}
      title="Agent Performance Detail"
      maxWidth="max-w-2xl"
    >
      <div className="py-4 space-y-8">
        <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
           <Avatar name={agent.name} size="lg" />
           <div>
              <h3 className="text-lg font-black text-[#1c1c1c] tracking-tight">{agent.name}</h3>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">{agent.email}</div>
           </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
           <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Lifetime Revenue</p>
              <p className="text-lg font-black text-emerald-600">{formatCurrency(agent.revenue || agent.revenue_recovered || 0)}</p>
           </div>
           <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Tasks</p>
              <p className="text-lg font-black text-[#1c1c1c]">{agent.taskCount || agent.tasks_resolved || 0}</p>
           </div>
           <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Productivity</p>
              <p className="text-lg font-black text-amber-600">{agent.productivity || 0} T/H</p>
           </div>
        </div>

        <div className="space-y-4">
           <h4 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest flex items-center gap-2">
              <History className="w-4 h-4" /> Activity Transitions
           </h4>
           <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
              {recentActivity
                .filter((l: any) => l.agent_id === agent.id || l.agent_id === agent.agent_id)
                .map((log: any) => (
                  <div key={log.id} className="p-3 bg-gray-50 rounded-xl border border-transparent hover:border-gray-100 transition-all">
                    <div className="flex items-center justify-between mb-1">
                       <span className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-wider">{log.activity_type.replace('_', ' ')}</span>
                       <span className="text-[9px] font-bold text-gray-400">{format(new Date(log.created_at), "PPp")}</span>
                    </div>
                    {log.metadata?.description && <p className="text-[10px] text-gray-500 italic">&ldquo;{log.metadata.description}&rdquo;</p>}
                  </div>
              ))}
              {recentActivity.filter((l: any) => l.agent_id === agent.id || l.agent_id === agent.agent_id).length === 0 && (
                <div className="py-8 text-center text-[10px] text-gray-400 italic">No recent activity found.</div>
              )}
           </div>
        </div>

        <button className="btn-secondary w-full py-4 text-[10px] font-black uppercase tracking-widest" onClick={onClose}>
           Close Audit View
        </button>
      </div>
    </Modal>
  );
}
