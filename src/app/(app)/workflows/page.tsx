"use client";
import { useState, useEffect } from "react";
import { Zap, Plus, Trash2, Edit3, CheckCircle2, AlertCircle, Play, Settings, ArrowRight, Send, RefreshCw } from "lucide-react";
import { PageHeader, Modal } from "@/components/ui";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { AccessDenied } from "@/components/ui";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { isDemoMode } from "@/lib/demo";

const TRIGGERS = [
  { id: "order_placed", label: "Order Placed", desc: "When a new order is received from Shopify" },
  { id: "order_delivered", label: "Order Delivered", desc: "When package is marked as delivered" },
  { id: "order_rto", label: "RTO Flagged", desc: "When order returns to origin" },
  { id: "cart_abandoned", label: "Cart Abandoned", desc: "When checkout is dropped" },
];

export default function WorkflowManager() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    trigger_event: "order_delivered",
    is_active: true,
    actions: [] as any[]
  });

  const fetchWorkflows = async () => {
    const isDemo = isDemoMode();
    if (isDemo) {
      setLoading(true);
      const { MOCK_WORKFLOWS } = await import("@/lib/mockData");
      setWorkflows(MOCK_WORKFLOWS);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/workflows");
      const data = await res.json();
      // Business rules (kind = "rule") share this table but are edited on /workflows/rules.
      setWorkflows((data.workflows || []).filter((w: any) => w.kind !== "rule"));
    } catch (e) {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  if (profileLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-[#5f5f5d] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Synchronizing Automations...</p>
      </div>
    );
  }

  if (!hasPermission(profile, "manage_automations")) {
    return <AccessDenied title="Automation Engine Locked" desc="Only admins or users with automation management rights can modify workflows." />;
  }

  const handleCreateTaskAction = () => {
    setFormData({
      ...formData,
      actions: [...formData.actions, { 
        type: "create_task", 
        params: { task_type: "review", delay_days: 5, priority_bonus: 10 } 
      }]
    });
  };
  
  const handleWhatsAppAction = () => {
    setFormData({
      ...formData,
      actions: [...formData.actions, { 
        type: "message", 
        params: { message_text: "", template_name: "Review Reminder", delay_days: 0 } 
      }]
    });
  };

  const handleSave = async () => {
    if (!formData.name) return toast.error("Name is required");
    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success("Demo: Workflow Saved");
      setShowModal(false);
      return;
    }
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        toast.success("Workflow Saved");
        setShowModal(false);
        fetchWorkflows();
      }
    } catch (e) {}
  };

  const handleEdit = (wf: any) => {
    setFormData({
      id: wf.id,
      name: wf.name,
      trigger_event: wf.trigger_event,
      is_active: wf.is_active,
      actions: wf.actions || []
    } as any);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;
    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success("Demo: Workflow deleted");
      setWorkflows(prev => prev.filter(wf => wf.id !== id));
      return;
    }
    try {
      const res = await fetch(`/api/workflows?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Workflow deleted");
        fetchWorkflows();
      }
    } catch (e) {}
  };

  const handleToggleStatus = async (wf: any) => {
    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success(`Demo: Workflow ${!wf.is_active ? 'Activated' : 'Paused'}`);
      setWorkflows(prev => prev.map(w => w.id === wf.id ? { ...w, is_active: !w.is_active } : w));
      return;
    }
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...wf, is_active: !wf.is_active })
      });
      if (res.ok) {
        toast.success(`Workflow ${!wf.is_active ? 'Activated' : 'Paused'}`);
        fetchWorkflows();
      }
    } catch (e) {}
  };

  const handleNew = () => {
    setFormData({
      name: "",
      trigger_event: "order_delivered",
      is_active: true,
      actions: []
    } as any);
    setShowModal(true);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader 
        title="Automation Engine" 
        subtitle="Manage event-driven CRM workflows and task automation"
        actions={
          <button onClick={handleNew} className="btn-primary py-2 px-6 text-[10px] font-bold uppercase tracking-widest">
            <Plus className="w-3.5 h-3.5" /> Create Workflow
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4">
        {workflows.map(wf => (
          <div key={wf.id} className="card p-5 flex items-center justify-between group hover:border-[#1c1c1c]/30 transition-all bg-[#fcfbf8]">
             <div className="flex items-center gap-5">
                <div className={cn(
                   "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                   wf.is_active ? "bg-[#1c1c1c] text-[#f7f4ed] shadow-lg shadow-black/10" : "bg-[#eceae4] text-[#5f5f5d]"
                )}>
                  <Zap className={cn("w-5 h-5", wf.is_active && "fill-current")} />
                </div>
                <div>
                   <h3 className="text-sm font-bold text-[#1c1c1c] mb-1">{wf.name}</h3>
                  <div className="flex items-center gap-3 text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest opacity-60">
                    <span>{wf.trigger_event.replace("_", " ")}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span>{wf.actions?.length || 0} Actions</span>
                  </div>
                </div>
             </div>

             <div className="flex items-center gap-4">
                 <button 
                   onClick={() => handleToggleStatus(wf)}
                   className={cn(
                    "px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-all hover:scale-105 active:scale-95",
                    wf.is_active ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-amber-50 border-amber-100 text-amber-700"
                  )}
                 >
                   {wf.is_active ? "Active" : "Paused"}
                 </button>
                 <div className="flex items-center gap-1">
                   <button onClick={() => handleEdit(wf)} className="w-8 h-8 flex items-center justify-center hover:bg-[#eceae4] rounded-lg text-[#5f5f5d] transition-colors">
                     <Edit3 className="w-4 h-4" />
                   </button>
                   <button onClick={() => handleDelete(wf.id)} className="w-8 h-8 flex items-center justify-center hover:bg-rose-50 rounded-lg text-[#5f5f5d] hover:text-rose-600 transition-colors">
                     <Trash2 className="w-4 h-4" />
                   </button>
                 </div>
             </div>
          </div>
        ))}

        {workflows.length === 0 && (
          <div className="py-24 text-center flex flex-col items-center justify-center gap-6 bg-[#eceae4]/10 rounded-3xl border border-dashed border-[#eceae4]">
             <div className="w-20 h-20 bg-[#eceae4]/30 rounded-full flex items-center justify-center shadow-inner">
               <Zap className="w-10 h-10 text-[#5f5f5d] opacity-20" />
             </div>
             <div className="max-w-xs">
               <p className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-[0.2em] mb-2">System Idle</p>
               <p className="text-xs text-[#5f5f5d] leading-relaxed">Your automation engine is ready. Create a workflow to streamline repetitive tasks and improve customer retention.</p>
             </div>
          </div>
        )}
      </div>

      <Modal 
        open={showModal} 
        onClose={() => setShowModal(false)} 
        title="Configure Workflow"
        maxWidth="max-w-2xl"
        footer={<>
          <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Workflow</button>
        </>}
      >
        <div className="space-y-6">
          <div>
            <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest block mb-2 opacity-60">Workflow Name</label>
            <input 
              className="input text-xs bg-[#fcfbf8]" 
              placeholder="e.g. 5-Day Delivery Follow-up" 
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-[#eceae4]/20 rounded-2xl border border-[#eceae4]/50">
             <div>
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block">Workflow Status</label>
                <p className="text-[9px] text-[#5f5f5d] mt-1 font-medium italic opacity-60">Enable or disable this automation globally</p>
             </div>
             <button 
               onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
               className={cn(
                 "relative w-10 h-6 rounded-full transition-all duration-300",
                 formData.is_active ? "bg-emerald-500" : "bg-[#eceae4]"
               )}
             >
                <div className={cn(
                  "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-sm",
                  formData.is_active && "translate-x-4"
                )} />
             </button>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-4">1. Select Trigger</label>
              <div className="space-y-3">
                {TRIGGERS.map(t => (
                  <button 
                    key={t.id}
                    onClick={() => setFormData({ ...formData, trigger_event: t.id })}
                     className={cn(
                       "w-full text-left p-4 rounded-xl border transition-all relative overflow-hidden group",
                       formData.trigger_event === t.id ? "bg-[#1c1c1c] text-white border-[#1c1c1c] shadow-lg" : "bg-[#fcfbf8] border-[#eceae4] hover:border-[#1c1c1c]/30"
                     )}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest">{t.label}</div>
                    <div className={cn("text-[9px] mt-1 leading-relaxed", formData.trigger_event === t.id ? "text-white/60" : "text-[#5f5f5d] opacity-70")}>{t.desc}</div>
                    {formData.trigger_event === t.id && <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/20" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-4">2. Define Actions</label>
              <div className="space-y-4">
                {formData.actions.map((action, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-[#eceae4] bg-[#fcfbf8] relative group">
                    <div className="flex justify-between items-start mb-3">
                       <span className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-[0.2em]">{action.type.replace("_", " ")}</span>
                       <button onClick={() => setFormData({ ...formData, actions: formData.actions.filter((_, i) => i !== idx) })} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                       </button>
                    </div>
                    {/* Action config */}
                    <div className="space-y-3">
                       {action.type === "create_task" && (
                         <>
                            <div className="flex items-center justify-between gap-2 border-b border-[#eceae4]/50 pb-2">
                               <span className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest opacity-60">Task Type</span>
                               <select 
                                 className="bg-[#fcfbf8] border border-[#eceae4] rounded-lg px-2.5 py-1 text-[10px] font-bold text-[#1c1c1c] focus:outline-none focus:border-[#1c1c1c]/30 hover:border-[#1c1c1c]/20 transition-all cursor-pointer shadow-sm text-right max-w-[150px]"
                                 value={action.params?.task_type || "review"}
                                 onChange={e => {
                                   const newActions = [...formData.actions];
                                   newActions[idx].params.task_type = e.target.value;
                                   setFormData({ ...formData, actions: newActions });
                                 }}
                               >
                                  <option value="review" className="bg-[#fcfbf8] text-[#1c1c1c]">Review</option>
                                  <option value="reorder" className="bg-[#fcfbf8] text-[#1c1c1c]">Reorder</option>
                                  <option value="final_followup" className="bg-[#fcfbf8] text-[#1c1c1c]">Final Followup</option>
                                  <option value="recovery" className="bg-[#fcfbf8] text-[#1c1c1c]">Recovery</option>
                                  <option value="issue_resolution" className="bg-[#fcfbf8] text-[#1c1c1c]">Issue Resolution</option>
                                  <option value="transit_update" className="bg-[#fcfbf8] text-[#1c1c1c]">Transit Update</option>
                                  <option value="cod_verify" className="bg-[#fcfbf8] text-[#1c1c1c]">COD Verify</option>
                                  <option value="ndr" className="bg-[#fcfbf8] text-[#1c1c1c]">NDR</option>
                                  <option value="manager_audit" className="bg-[#fcfbf8] text-[#1c1c1c]">Manager Audit</option>
                                  <option value="welcome_call" className="bg-[#fcfbf8] text-[#1c1c1c]">Welcome Call</option>
                                  <option value="win_back" className="bg-[#fcfbf8] text-[#1c1c1c]">Win Back</option>
                                  <option value="vip_followup" className="bg-[#fcfbf8] text-[#1c1c1c]">VIP Followup</option>
                                  <option value="flagged" className="bg-[#fcfbf8] text-[#1c1c1c]">Flagged</option>
                               </select>
                            </div>
                           <div className="flex items-center justify-between gap-2 border-b border-[#eceae4]/50 pb-2">
                              <span className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest opacity-60">Delay (Days)</span>
                              <input 
                                type="number" 
                                className="w-10 bg-transparent text-[10px] font-bold text-[#1c1c1c] text-right focus:outline-none" 
                                value={action.params?.delay_days || 0} 
                                onChange={e => {
                                  const newActions = [...formData.actions];
                                  newActions[idx].params.delay_days = parseInt(e.target.value) || 0;
                                  setFormData({ ...formData, actions: newActions });
                                }}
                              />
                           </div>
                           <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest opacity-60">Priority Bonus</span>
                              <input 
                                type="number" 
                                className="w-10 bg-transparent text-[10px] font-bold text-[#1c1c1c] text-right focus:outline-none" 
                                value={action.params?.priority_bonus || 0} 
                                onChange={e => {
                                  const newActions = [...formData.actions];
                                  newActions[idx].params.priority_bonus = parseInt(e.target.value) || 0;
                                  setFormData({ ...formData, actions: newActions });
                                }}
                              />
                           </div>
                         </>
                       )}

                       {action.type === "message" && (
                         <>
                           <div className="flex flex-col gap-2 border-b border-[#eceae4]/50 pb-2">
                              <span className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest opacity-60">Template Reference</span>
                              <select 
                                className="w-full bg-[#fcfbf8] border border-[#eceae4] rounded-lg px-3 py-2 text-[10px] font-bold text-[#1c1c1c] focus:outline-none focus:border-[#1c1c1c]/30 hover:border-[#1c1c1c]/20 transition-all cursor-pointer shadow-sm mt-1"
                                value={action.params?.template_name || "Review Reminder"}
                                onChange={e => {
                                  const newActions = [...formData.actions];
                                  newActions[idx].params.template_name = e.target.value;
                                  setFormData({ ...formData, actions: newActions });
                                }}
                              >
                                 <option value="Review Reminder" className="bg-[#fcfbf8] text-[#1c1c1c]">Review Reminder</option>
                                 <option value="Reorder Reminder" className="bg-[#fcfbf8] text-[#1c1c1c]">Reorder Reminder</option>
                                 <option value="Abandoned Checkout Strategy" className="bg-[#fcfbf8] text-[#1c1c1c]">Abandoned Checkout</option>
                                 <option value="Final Follow-up" className="bg-[#fcfbf8] text-[#1c1c1c]">Final Follow-up</option>
                              </select>
                           </div>
                           <div className="flex flex-col gap-2">
                              <span className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest opacity-60">Custom Text (Overrides Template)</span>
                              <textarea 
                                className="w-full bg-[#f7f4ed]/50 border border-[#eceae4] rounded-lg p-2 text-[10px] font-medium min-h-[60px]"
                                placeholder="Enter custom WhatsApp text..."
                                value={action.params?.message_text || ""}
                                onChange={e => {
                                  const newActions = [...formData.actions];
                                  newActions[idx].params.message_text = e.target.value;
                                  setFormData({ ...formData, actions: newActions });
                                }}
                              />
                           </div>
                         </>
                       )}
                    </div>
                  </div>
                ))}

                 <div className="grid grid-cols-2 gap-3">
                   <button 
                     onClick={handleCreateTaskAction}
                     className="py-4 rounded-xl border border-dashed border-[#eceae4] text-[#5f5f5d] hover:text-[#1c1c1c] hover:border-[#1c1c1c] transition-all flex flex-col items-center justify-center gap-1 group bg-[#eceae4]/10"
                   >
                     <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                       <Plus className="w-3 h-3" />
                     </div>
                     <span className="text-[8px] font-black uppercase tracking-widest">New Task</span>
                   </button>
                   <button 
                     onClick={handleWhatsAppAction}
                     className="py-4 rounded-xl border border-dashed border-[#eceae4] text-[#5f5f5d] hover:text-[#1c1c1c] hover:border-[#1c1c1c] transition-all flex flex-col items-center justify-center gap-1 group bg-[#eceae4]/10"
                   >
                     <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                       <Send className="w-3 h-3" />
                     </div>
                     <span className="text-[8px] font-black uppercase tracking-widest">New Message</span>
                   </button>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
