"use client";
import { useState, useEffect } from "react";
import { Zap, Plus, Trash2, Edit3, CheckCircle2, AlertCircle, Play, Settings, ArrowRight } from "lucide-react";
import { PageHeader, Modal } from "@/components/ui";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

const TRIGGERS = [
  { id: "order_placed", label: "Order Placed", desc: "When a new order is received from Shopify" },
  { id: "order_delivered", label: "Order Delivered", desc: "When package is marked as delivered" },
  { id: "order_rto", label: "RTO Flagged", desc: "When order returns to origin" },
  { id: "cart_abandoned", label: "Cart Abandoned", desc: "When checkout is dropped" },
];

const ACTION_TYPES = [
  { id: "create_task", label: "Create Task", desc: "Assign a follow-up task to an agent" },
  { id: "add_tag", label: "Tag Customer", desc: "Add a categorization tag to customer" },
];

export default function WorkflowManager() {
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
    setLoading(true);
    try {
      // Logic would fetch from campaign_templates table or a new workflows table
      // For now using mock fetch as we need to implement the API
      const res = await fetch("/api/workflows");
      const data = await res.json();
      setWorkflows(data.workflows || []);
    } catch (e) {
      // toast.error("Failed to load workflows");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const handleCreateTaskAction = () => {
    setFormData({
      ...formData,
      actions: [...formData.actions, { 
        type: "create_task", 
        params: { task_type: "feedback", delay_days: 5, priority_bonus: 10 } 
      }]
    });
  };

  const handleSave = async () => {
    if (!formData.name) return toast.error("Name is required");
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
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
    try {
      const res = await fetch(`/api/workflows?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Workflow deleted");
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
        title="Custom Workflow Engine" 
        subtitle="Automate your CRM tasks using 'If This, Then That' logic"
        actions={
          <button onClick={handleNew} className="btn-primary">
            <Plus className="w-4 h-4" /> New Workflow
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4">
        {workflows.map(wf => (
          <div key={wf.id} className="card p-5 flex items-center justify-between group hover:border-[#2D1E6F]/30 transition-all">
             <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  wf.is_active ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-400"
                )}>
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                   <h3 className="text-sm font-bold text-[#2D1E6F]">{wf.name}</h3>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium">
                    <span className="uppercase tracking-wider">{wf.trigger_event.replace("_", " ")}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span>{wf.actions?.length || 0} Actions</span>
                  </div>
                </div>
             </div>

             <div className="flex items-center gap-2">
                 <div className={cn(
                   "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border",
                   wf.is_active ? "bg-blue-50 border-blue-100 text-blue-600" : "bg-gray-50 border-gray-100 text-gray-400"
                 )}>
                   {wf.is_active ? "Active" : "Paused"}
                 </div>
                <button onClick={() => handleEdit(wf)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(wf.id)} className="p-2 hover:bg-rose-50 rounded-lg text-gray-400 hover:text-rose-600 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
             </div>
          </div>
        ))}

        {workflows.length === 0 && (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-4">
             <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
               <Zap className="w-8 h-8 text-gray-200" />
             </div>
             <div>
               <p className="text-sm font-bold text-gray-400">No automation workflows yet</p>
               <p className="text-xs text-gray-300 mt-1">Build your first rule to automate repetitive tasks</p>
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
            <label className="text-xs font-bold text-gray-700 block mb-1">Workflow Name</label>
            <input 
              className="input text-sm" 
              placeholder="e.g. 5-Day Delivery Follow-up" 
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-2">1. When this happens (Trigger)</label>
              <div className="space-y-2">
                {TRIGGERS.map(t => (
                  <button 
                    key={t.id}
                    onClick={() => setFormData({ ...formData, trigger_event: t.id })}
                     className={cn(
                       "w-full text-left p-3 rounded-xl border transition-all",
                       formData.trigger_event === t.id ? "bg-[#2D1E6F] text-white border-[#2D1E6F] shadow-md" : "bg-gray-50 border-gray-100 hover:border-gray-200"
                     )}
                  >
                    <div className="text-[11px] font-bold">{t.label}</div>
                    <div className={cn("text-[9px] mt-0.5", formData.trigger_event === t.id ? "text-white/70" : "text-gray-400")}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-2">2. Then do this (Actions)</label>
              <div className="space-y-3">
                {formData.actions.map((action, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-blue-100 bg-blue-50/30">
                    <div className="flex justify-between items-start mb-2">
                       <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{action.type.replace("_", " ")}</span>
                       <button onClick={() => setFormData({ ...formData, actions: formData.actions.filter((_, i) => i !== idx) })}>
                          <Trash2 className="w-3 h-3 text-rose-400" />
                       </button>
                    </div>
                    {/* Action config */}
                    <div className="space-y-2">
                       <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gray-500">Task Type</span>
                          <select className="bg-transparent text-[10px] font-bold text-gray-700 focus:outline-none">
                             <option value="review">Review</option>
                             <option value="feedback">Feedback</option>
                             <option value="reorder">Reorder</option>
                          </select>
                       </div>
                       <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gray-500">Delay (Days)</span>
                          <input type="number" className="w-10 bg-transparent text-[10px] font-bold text-gray-700 text-right focus:outline-none" defaultValue={5} />
                       </div>
                    </div>
                  </div>
                ))}

                 <button 
                   onClick={handleCreateTaskAction}
                   className="w-full py-3 rounded-xl border border-dashed border-gray-200 text-gray-400 hover:text-[#2D1E6F] hover:border-[#2D1E6F] transition-all flex flex-col items-center justify-center gap-1"
                 >
                   <Plus className="w-4 h-4" />
                   <span className="text-[10px] font-bold">Add Action</span>
                 </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
