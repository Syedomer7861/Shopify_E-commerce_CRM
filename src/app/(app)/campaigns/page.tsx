"use client";
import { useState, useEffect, useCallback } from "react";
import { Megaphone, Plus, Search, Play, Pause, BarChart3, Users, Clock, AlertCircle, CheckCircle2, Pencil, XCircle, Eye, Trash2 } from "lucide-react";
import { PageHeader, Modal, StatCard, Pagination } from "@/components/ui";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { AccessDenied } from "@/components/ui";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { isAdmin } from "@/lib/permissions";

const SEGMENTS = ["repeat", "one_time", "inactive", "risky", "all"];

export default function CampaignManager() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [currentPage, setCurrentPage] = useState(1);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  
  // Detailed Recipient Logs Modal States
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [logSearchQuery, setLogSearchQuery] = useState("");

  const selectedCampaignForLogs = campaigns.find(c => c.id === selectedCampaignId) || null;

  // Deletion Modal States
  const [deleteCampaignId, setDeleteCampaignId] = useState<string | null>(null);
  const campaignToDelete = campaigns.find(c => c.id === deleteCampaignId) || null;

  const [formData, setFormData] = useState({
    name: "",
    template_id: "",
    target_segment: "all",
    preset: "safe", // "safe" | "fast" | "max_safe" | "custom"
    min_delay: 30,
    max_delay: 90,
    scheduled_start: "",
    send_window_start: "09:00",
    send_window_end: "21:00",
    is_scheduled: false
  });
  const ITEMS_PER_PAGE = 10;

  const fetchData = useCallback(async () => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setLoading(true);
      const { MOCK_CAMPAIGNS, MOCK_TEMPLATES } = await import("@/lib/mockData");
      setCampaigns(MOCK_CAMPAIGNS);
      setTemplates(MOCK_TEMPLATES);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [campRes, tplRes] = await Promise.all([
        fetch("/api/campaigns"),
        fetch("/api/templates")
      ]);
      const campData = await campRes.json();
      const tplData = await tplRes.json();
      
      setCampaigns(campData.campaigns || []);
      setTemplates(tplData.templates || []);
    } catch (e) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set up periodic polling for real-time campaign logs and progress bar update!
  useEffect(() => {
    const activeCampaignsExist = campaigns.some(c => c.status === "running");
    if (activeCampaignsExist || selectedCampaignId) {
      const timer = setInterval(() => {
        fetchData();
      }, 3000); // Poll every 3 seconds for smooth real-time updates!
      return () => clearInterval(timer);
    }
  }, [campaigns, selectedCampaignId, fetchData]);

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-[#5f5f5d]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#1c1c1c]/20 border-t-[#1c1c1c] rounded-full animate-spin" />
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Verifying Clearance...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin(profile)) {
    return (
      <AccessDenied 
        title="Marketing Hub Restricted" 
        desc="Only administrators can orchestrate bulk WhatsApp campaigns and manage marketing segments." 
      />
    );
  }

  const handleNewClick = () => {
    setFormData({
      name: "",
      template_id: "",
      target_segment: "all",
      preset: "safe",
      min_delay: 30,
      max_delay: 90,
      scheduled_start: "",
      send_window_start: "09:00",
      send_window_end: "21:00",
      is_scheduled: false
    });
    setEditId(null);
    setShowModal(true);
  };

  const handleEditClick = (c: any) => {
    let preset = "custom";
    if (c.min_delay === 30 && c.max_delay === 90) preset = "safe";
    else if (c.min_delay === 10 && c.max_delay === 20) preset = "fast";
    else if (c.min_delay === 60 && c.max_delay === 120) preset = "max_safe";

    setFormData({
      name: c.name,
      template_id: c.template_id || "",
      target_segment: c.target_segment || "all",
      preset,
      min_delay: c.min_delay ?? 30,
      max_delay: c.max_delay ?? 90,
      scheduled_start: c.scheduled_start || "",
      send_window_start: c.send_window_start || "09:00",
      send_window_end: c.send_window_end || "21:00",
      is_scheduled: !!c.scheduled_start
    });
    setEditId(c.id);
    setShowModal(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteCampaignId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteCampaignId) return;
    const id = deleteCampaignId;
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    
    setDeleteCampaignId(null);
    
    if (isDemo) {
      toast.success("Demo: Campaign deleted");
      setCampaigns(prev => prev.filter(c => c.id !== id));
      return;
    }
    try {
      const res = await fetch(`/api/campaigns?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Campaign deleted");
        fetchData();
      } else {
        toast.error("Failed to delete campaign");
      }
    } catch (e) {
      toast.error("Failed to delete campaign");
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.template_id) return toast.error("Name and Template are required");
    const isDemo = document.cookie.includes("crm-demo-mode=true");

    if (editId) {
      if (isDemo) {
        toast.success("Demo: Campaign settings updated (local simulation)");
        setCampaigns(prev => prev.map(c => c.id === editId ? { 
          ...c, 
          name: formData.name, 
          template_id: formData.template_id, 
          target_segment: formData.target_segment,
          min_delay: formData.min_delay,
          max_delay: formData.max_delay,
          scheduled_start: formData.is_scheduled ? formData.scheduled_start : "",
          send_window_start: formData.send_window_start,
          send_window_end: formData.send_window_end
        } : c));
        setShowModal(false);
        return;
      }
      try {
        const res = await fetch(`/api/campaigns?id=${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            template_id: formData.template_id,
            target_segment: formData.target_segment,
            min_delay: formData.min_delay,
            max_delay: formData.max_delay,
            scheduled_start: formData.is_scheduled ? formData.scheduled_start : "",
            send_window_start: formData.send_window_start,
            send_window_end: formData.send_window_end
          })
        });
        if (res.ok) {
          toast.success("Campaign Updated");
          setShowModal(false);
          fetchData();
        } else {
          toast.error("Failed to update campaign");
        }
      } catch (e) {
        toast.error("Failed to update campaign");
      }
    } else {
      if (isDemo) {
        toast.success("Demo: Campaign created (local simulation)");
        setShowModal(false);
        return;
      }
      try {
        const res = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            template_id: formData.template_id,
            target_segment: formData.target_segment,
            min_delay: formData.min_delay,
            max_delay: formData.max_delay,
            scheduled_start: formData.is_scheduled ? formData.scheduled_start : "",
            send_window_start: formData.send_window_start,
            send_window_end: formData.send_window_end
          })
        });
        if (res.ok) {
          toast.success("Campaign Created");
          setShowModal(false);
          fetchData();
        } else {
          toast.error("Failed to create campaign");
        }
      } catch (e) {
        toast.error("Failed to create campaign");
      }
    }
  };

  const handleRun = async (id: string) => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success("Demo: Campaign started (simulation)");
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: "running" } : c));
      return;
    }
    try {
      const res = await fetch(`/api/campaigns?id=${id}&action=run`, { method: "PATCH" });
      if (res.ok) {
        toast.success("Campaign Started");
        fetchData();
      }
    } catch (e) {
      toast.error("Failed to start campaign");
    }
  };

  const handlePause = async (id: string) => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success("Demo: Campaign paused");
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: "paused" } : c));
      return;
    }
    try {
      const res = await fetch(`/api/campaigns?id=${id}&action=pause`, { method: "PATCH" });
      if (res.ok) {
        toast.success("Campaign Paused");
        fetchData();
      }
    } catch (e) {
      toast.error("Failed to pause campaign");
    }
  };

  const paginatedCampaigns = campaigns.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="animate-fade-in">
      <PageHeader 
        title="Campaign Orchestrator" 
        subtitle="Schedule and monitor automated WhatsApp broadcast campaigns"
        actions={
          <button onClick={handleNewClick} className="btn-primary">
            <Plus className="w-4 h-4" /> Create Campaign
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Campaigns" value={campaigns.filter(c => c.status === "running").length} sub="Currently sending" accent="text-[#1c1c1c]" />
        <StatCard label="Completed" value={campaigns.filter(c => c.status === "completed").length} sub="Lifetime total" accent="text-[#5f5f5d]" />
        <StatCard label="Total Messages" value={campaigns.reduce((s, c) => s + (c.delivered_count || 0), 0)} sub="Across all campaigns" accent="text-[#1c1c1c]" />
        {(() => {
          if (campaigns.length === 0) {
            return <StatCard label="Avg. Open Rate" value="N/A" sub="No campaigns launched" accent="text-[#5f5f5d]" />;
          }
          const totalDelivered = campaigns.reduce((acc, c) => acc + (c.delivered_count || 0), 0);
          const totalRead = campaigns.reduce((acc, c) => acc + (c.read_count || 0), 0);
          if (totalDelivered === 0) {
            return <StatCard label="Avg. Open Rate" value="N/A" sub="Waiting for delivery" accent="text-[#5f5f5d]" />;
          }
          const rate = Math.round((totalRead / totalDelivered) * 100);
          return (
            <StatCard 
              label="Avg. Open Rate" 
              value={`${rate}%`} 
              sub={rate > 50 ? "High engagement" : "Average engagement"} 
              accent="text-[#1c1c1c]" 
            />
          );
        })()}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Campaign Name</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Template</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Segment</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Progress</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginatedCampaigns.map(c => (
              <tr key={c.id} className="hover:bg-gray-50/50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="text-sm font-bold text-[#1c1c1c]">{c.name}</div>
                  <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-2.5 h-2.5" /> Created {new Date(c.created_at).toLocaleDateString()}
                  </div>
                  {c.scheduled_start && (
                    <div className="text-[9px] text-indigo-600 font-bold flex items-center gap-1 mt-1 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded w-max">
                      <Clock className="w-2.5 h-2.5" /> Scheduled: {new Date(c.scheduled_start).toLocaleString()}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                    {c.template?.name || "No Template"}
                  </span>
                </td>
                <td className="px-6 py-4">
                   <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium capitalize">
                     <Users className="w-3 h-3 text-gray-400" /> {c.target_segment}
                   </div>
                </td>
                <td className="px-6 py-4">
                  <div className="w-40">
                    <div className="flex justify-between text-[9px] font-bold mb-1">
                      <span className="text-[#5f5f5d]">
                        Progress: {c.delivered_count + (c.failed_count || 0)} / {c.total_recipients || "?"}
                      </span>
                      <span className="text-[#1c1c1c]">
                        {c.total_recipients ? Math.round(((c.delivered_count + (c.failed_count || 0)) / c.total_recipients) * 100) : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-[#eceae4] h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full transition-all duration-1000", 
                          c.status === "completed" ? "bg-emerald-600" : "bg-[#1c1c1c]/40"
                        )}
                        style={{ width: `${c.total_recipients ? ((c.delivered_count + (c.failed_count || 0)) / c.total_recipients) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2.5 mt-1.5 text-[9px] font-bold">
                      <span className="inline-flex items-center gap-0.5 text-emerald-600">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Sent: {c.delivered_count}
                      </span>
                      {(c.failed_count || 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-rose-600">
                          <XCircle className="w-2.5 h-2.5" /> Failed: {c.failed_count}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                    c.status === "running" ? "bg-[#f7f4ed] border-[#1c1c1c]/20 text-[#1c1c1c]" :
                    c.status === "completed" ? "bg-[#eceae4] border-[#eceae4] text-[#1c1c1c]" :
                    "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]"
                  )}>
                    {c.status === "running" && <div className="w-1 h-1 rounded-full bg-[#1c1c1c] animate-ping" />}
                    {c.status}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => {
                        setSelectedCampaignId(c.id);
                        setLogSearchQuery("");
                      }} 
                      title="Inspect Delivery Logs"
                      className="p-2 bg-[#1c1c1c]/5 text-[#1c1c1c] rounded-lg hover:bg-[#1c1c1c]/10 transition-colors shadow-sm border border-[#1c1c1c]/10"
                    >
                       <Eye className="w-3.5 h-3.5" />
                    </button>
                    {(c.status === "draft" || c.status === "paused") && (
                       <button 
                         onClick={() => handleEditClick(c)} 
                         title="Edit Settings"
                         className="p-2 bg-[#1c1c1c]/5 text-gray-600 rounded-lg hover:bg-[#1c1c1c]/10 transition-colors shadow-sm border border-[#1c1c1c]/10"
                       >
                          <Pencil className="w-3.5 h-3.5" />
                       </button>
                    )}
                    {(c.status === "draft" || c.status === "paused") && (
                       <button 
                         onClick={() => handleRun(c.id)} 
                         title="Start Campaign"
                         className="p-2 bg-[#1c1c1c]/5 text-[#1c1c1c] rounded-lg hover:bg-[#1c1c1c]/10 transition-colors shadow-sm border border-[#1c1c1c]/10"
                       >
                          <Play className="w-3.5 h-3.5 fill-current" />
                       </button>
                    )}
                    {c.status === "running" && (
                       <button 
                         onClick={() => handlePause(c.id)} 
                         title="Pause Campaign"
                         className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors border border-amber-200"
                       >
                          <Pause className="w-3.5 h-3.5 fill-current" />
                       </button>
                    )}
                    {c.status === "completed" && (
                      <BarChart3 className="w-4 h-4 text-gray-300 ml-auto" />
                    )}
                    {(c.status === "draft" || c.status === "paused" || c.status === "completed") && (
                       <button 
                         onClick={() => handleDeleteClick(c.id)} 
                         title="Delete Campaign"
                         className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors shadow-sm border border-rose-100"
                       >
                          <Trash2 className="w-3.5 h-3.5" />
                       </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {campaigns.length === 0 && !loading && (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-4">
             <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
               <Megaphone className="w-8 h-8 text-gray-200" />
             </div>
             <div>
               <p className="text-sm font-bold text-gray-400">No campaigns launched yet</p>
               <p className="text-xs text-gray-300 mt-1">Start by creating your first WhatsApp broadcast</p>
             </div>
          </div>
        )}
        {campaigns.length > ITEMS_PER_PAGE && (
          <div className="px-6 border-t border-gray-100">
            <Pagination 
              current={currentPage} 
              total={campaigns.length} 
              pageSize={ITEMS_PER_PAGE} 
              onChange={setCurrentPage} 
            />
          </div>
        )}
      </div>

      {/* Delete Campaign Confirmation Modal */}
      <Modal
        open={!!deleteCampaignId}
        onClose={() => setDeleteCampaignId(null)}
        title="Delete Campaign Permanently"
        footer={<>
          <button className="btn-secondary" onClick={() => setDeleteCampaignId(null)}>Cancel</button>
          <button className="btn-primary bg-rose-600 border-rose-600 hover:bg-rose-700 hover:border-rose-700 text-[#f7f4ed] font-bold" onClick={handleConfirmDelete}>
            Delete Permanently
          </button>
        </>}
      >
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 text-rose-600">
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center border border-rose-100 shadow-sm shrink-0">
              <Trash2 className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1c1c1c]">Confirm permanent deletion</p>
              <p className="text-xs text-gray-500">This action cannot be undone.</p>
            </div>
          </div>
          
          <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 space-y-2 mt-2">
            <p className="text-xs text-rose-900 leading-relaxed">
              Are you sure you want to permanently delete the campaign <strong className="font-extrabold">"{campaignToDelete?.name}"</strong>?
            </p>
            <p className="text-[10px] text-rose-700 leading-relaxed">
              This will remove all associated database records, settings, and historical logs permanently from the active workspace.
            </p>
          </div>
        </div>
      </Modal>

      {/* Create / Edit Modal */}
      <Modal 
        open={showModal} 
        onClose={() => setShowModal(false)} 
        title={editId ? "Edit Campaign Settings" : "Launch New Campaign"}
        footer={<>
          <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate}>
            {editId ? "Save Changes" : "Create Campaign"}
          </button>
        </>}
      >
         <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Campaign Name</label>
              <input 
                className="input text-sm" 
                placeholder="e.g. Diwali Flash Sale" 
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">WhatsApp Template</label>
                <select 
                  className="select text-sm"
                  value={formData.template_id}
                  onChange={e => setFormData({ ...formData, template_id: e.target.value })}
                >
                  <option value="">Select a template...</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Target Segment</label>
                <select 
                  className="select text-sm capitalize"
                  value={formData.target_segment}
                  onChange={e => setFormData({ ...formData, target_segment: e.target.value })}
                >
                  {SEGMENTS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </div>
            </div>

            {/* Anti-Ban Safeguard Speed Config */}
            <div className="border border-[#eceae4] rounded-lg p-3 bg-[#f7f4ed]/30 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#1c1c1c]">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                Anti-Ban Sending Speed Safeguard
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Standardizing random time delays between messages mimics natural human behaviour, significantly reducing the risk of your phone number being flagged or banned by WhatsApp/Meta.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-700 block mb-1">Speed Preset</label>
                  <select 
                    className="select text-xs"
                    value={formData.preset}
                    onChange={e => {
                      const val = e.target.value;
                      let min = 30;
                      let max = 90;
                      if (val === "fast") { min = 10; max = 20; }
                      else if (val === "max_safe") { min = 60; max = 120; }
                      setFormData({ ...formData, preset: val, min_delay: min, max_delay: max });
                    }}
                  >
                    <option value="safe">Safe (30s - 90s delay) — Recommended</option>
                    <option value="fast">Fast (10s - 20s delay) — Aggressive</option>
                    <option value="max_safe">Max Safe (60s - 120s delay) — New Numbers</option>
                    <option value="custom">Custom delays...</option>
                  </select>
                </div>
                {formData.preset === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-700 block mb-0.5">Min Delay (s)</label>
                      <input 
                        type="number" 
                        className="input text-xs" 
                        min={5}
                        value={formData.min_delay}
                        onChange={e => setFormData({ ...formData, min_delay: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-700 block mb-0.5">Max Delay (s)</label>
                      <input 
                        type="number" 
                        className="input text-xs" 
                        min={formData.min_delay}
                        value={formData.max_delay}
                        onChange={e => setFormData({ ...formData, max_delay: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Campaign Scheduling & Sending Window */}
            <div className="border border-[#eceae4] rounded-lg p-3 bg-[#f7f4ed]/30 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#1c1c1c]">
                <Clock className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                Campaign Schedule & Sending Window
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Determine exactly when your campaign will launch, and specify allowed operational hours to protect your customer relationships and WhatsApp account integrity.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-700 block mb-1">Execution Mode</label>
                  <select 
                    className="select text-xs"
                    value={formData.is_scheduled ? "scheduled" : "immediate"}
                    onChange={e => setFormData({ ...formData, is_scheduled: e.target.value === "scheduled" })}
                  >
                    <option value="immediate">Send Immediately (Run Manual)</option>
                    <option value="scheduled">Schedule for Specific Date & Time</option>
                  </select>
                </div>

                {formData.is_scheduled && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-700 block mb-1">Target Launch Time</label>
                    <input 
                      type="datetime-local" 
                      className="input text-xs"
                      value={formData.scheduled_start}
                      onChange={e => setFormData({ ...formData, scheduled_start: e.target.value })}
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-[#eceae4] pt-2 mt-2">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-bold text-gray-700 block">Daily Active Sending Hours</label>
                  <span className="text-[9px] text-[#5f5f5d] font-bold">Local Time</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-0.5">Start Hour</label>
                    <input 
                      type="time" 
                      className="input text-xs"
                      value={formData.send_window_start}
                      onChange={e => setFormData({ ...formData, send_window_start: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-0.5">End Hour</label>
                    <input 
                      type="time" 
                      className="input text-xs"
                      value={formData.send_window_end}
                      onChange={e => setFormData({ ...formData, send_window_end: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-[8px] text-gray-400 mt-1 italic">
                  * Safeguard active: campaign runner automatically pauses outside this time range to avoid night-time disturbance.
                </p>
              </div>
            </div>
         </div>
       </Modal>

      {/* Campaign Detailed Delivery Logs Inspect Modal */}
      <Modal
        open={!!selectedCampaignId}
        onClose={() => setSelectedCampaignId(null)}
        title={`Delivery Log: ${selectedCampaignForLogs?.name || ""}`}
        footer={<button className="btn-primary" onClick={() => setSelectedCampaignId(null)}>Close Log</button>}
      >
        <div className="space-y-4">
          {selectedCampaignForLogs && (
            <>
              {/* Delivery Stats Row */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="border border-gray-100 rounded-lg p-2 bg-gray-50/50">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total Targets</div>
                  <div className="text-sm font-black text-[#1c1c1c] mt-0.5">{selectedCampaignForLogs.total_recipients || 0}</div>
                </div>
                <div className="border border-emerald-100 rounded-lg p-2 bg-emerald-50/20">
                  <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Sent (Ok)</div>
                  <div className="text-sm font-black text-emerald-600 mt-0.5">{selectedCampaignForLogs.delivered_count}</div>
                </div>
                <div className="border border-rose-100 rounded-lg p-2 bg-rose-50/20">
                  <div className="text-[9px] font-bold text-rose-600 uppercase tracking-wider">Failed</div>
                  <div className="text-sm font-black text-rose-600 mt-0.5">{selectedCampaignForLogs.failed_count || 0}</div>
                </div>
                <div className="border border-amber-100 rounded-lg p-2 bg-amber-50/20">
                  <div className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Pending</div>
                  <div className="text-sm font-black text-amber-600 mt-0.5">
                    {Math.max(0, (selectedCampaignForLogs.total_recipients || 0) - selectedCampaignForLogs.delivered_count - (selectedCampaignForLogs.failed_count || 0))}
                  </div>
                </div>
              </div>

              {/* Real-time search filter */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-300" />
                <input
                  className="input text-xs pl-9"
                  placeholder="Search recipients by name or phone..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                />
              </div>

              {/* Scrollable Recipients List Table */}
              <div className="border border-gray-100 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 sticky top-0 font-bold text-gray-500">
                      <th className="px-4 py-2">Recipient Name</th>
                      <th className="px-4 py-2">Phone Number</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2 text-right">Sent Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(() => {
                      const allRecs = selectedCampaignForLogs.recipients || [];
                      const filtered = allRecs.filter((r: any) =>
                        r.name.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
                        r.phone.includes(logSearchQuery)
                      );
                      
                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-gray-400 italic">
                              No matching recipients found in this log.
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map((r: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-2 font-bold text-[#1c1c1c]">{r.name}</td>
                          <td className="px-4 py-2 font-mono text-gray-500">{r.phone || "-"}</td>
                          <td className="px-4 py-2">
                            <span
                              className={cn(
                                "inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border",
                                r.status === "delivered" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                                r.status === "failed" ? "bg-rose-50 border-rose-200 text-rose-700" :
                                "bg-amber-50 border-amber-200 text-amber-700"
                              )}
                            >
                              {r.status === "delivered" ? "Sent" : r.status}
                            </span>
                            {r.error && (
                              <div className="text-[9px] text-rose-500 mt-0.5 font-medium italic">
                                {r.error}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-400 font-mono">
                            {r.sent_at ? new Date(r.sent_at).toLocaleTimeString() : "-"}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
