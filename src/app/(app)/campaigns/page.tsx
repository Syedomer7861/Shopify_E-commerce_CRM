"use client";
import { useState, useEffect } from "react";
import { Megaphone, Plus, Search, Play, Pause, BarChart3, Users, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
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
  const [formData, setFormData] = useState({
    name: "",
    template_id: "",
    target_segment: "all",
    scheduled_at: ""
  });
  const ITEMS_PER_PAGE = 10;

  const fetchData = async () => {
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
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  const handleCreate = async () => {
    if (!formData.name || !formData.template_id) return toast.error("Name and Template are required");
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        toast.success("Campaign Created");
        setShowModal(false);
        fetchData();
      }
    } catch (e) {
      toast.error("Failed to create campaign");
    }
  };

  const handleRun = async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns?id=${id}`, { method: "PATCH" });
      if (res.ok) {
        toast.success("Campaign Started");
        fetchData();
      }
    } catch (e) {
      toast.error("Failed to start campaign");
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
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Create Campaign
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Campaigns" value={campaigns.filter(c => c.status === "running").length} sub="Currently sending" accent="text-[#1c1c1c]" />
        <StatCard label="Completed" value={campaigns.filter(c => c.status === "completed").length} sub="Lifetime total" accent="text-[#5f5f5d]" />
        <StatCard label="Total Messages" value={campaigns.reduce((s, c) => s + (c.delivered_count || 0), 0)} sub="Across all campaigns" accent="text-[#1c1c1c]" />
        <StatCard label="Avg. Open Rate" value="84%" sub="High engagement" accent="text-[#1c1c1c]" />
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
                  <div className="w-32">
                    <div className="flex justify-between text-[9px] font-bold mb-1">
                      <span className="text-[#5f5f5d]">{c.delivered_count} / {c.total_recipients || "?"}</span>
                      <span className="text-[#1c1c1c]">{c.total_recipients ? Math.round((c.delivered_count / c.total_recipients) * 100) : 0}%</span>
                    </div>
                    <div className="w-full bg-[#eceae4] h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full transition-all duration-1000", c.status === "completed" ? "bg-[#1c1c1c]" : "bg-[#1c1c1c]/40")}
                        style={{ width: `${c.total_recipients ? (c.delivered_count / c.total_recipients) * 100 : 0}%` }}
                      />
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
                  {c.status === "draft" && (
                     <button onClick={() => handleRun(c.id)} className="p-2 bg-[#1c1c1c]/5 text-[#1c1c1c] rounded-lg hover:bg-[#1c1c1c]/10 transition-colors shadow-sm border border-[#1c1c1c]/10">
                        <Play className="w-3.5 h-3.5 fill-current" />
                     </button>
                  )}
                  {c.status === "running" && (
                     <button className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors border border-amber-200">
                        <Pause className="w-3.5 h-3.5 fill-current" />
                     </button>
                  )}
                  {c.status === "completed" && (
                    <BarChart3 className="w-4 h-4 text-gray-300 ml-auto" />
                  )}
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

      {/* Create Modal */}
      <Modal 
        open={showModal} 
        onClose={() => setShowModal(false)} 
        title="Launch New Campaign"
        footer={<>
          <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate}>Create Campaign</button>
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
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Schedule Time (Optional)</label>
              <input 
                type="datetime-local"
                className="input text-sm" 
                value={formData.scheduled_at}
                onChange={e => setFormData({ ...formData, scheduled_at: e.target.value })}
              />
              <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Note: Leaving this empty will start the campaign as a draft.
              </p>
            </div>
         </div>
      </Modal>
    </div>
  );
}
