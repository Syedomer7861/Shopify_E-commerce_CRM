"use client";
import { useState, useEffect } from "react";
import { Plus, Search, MessageSquare, Save, Trash2, Edit3, Type, CheckCircle2, ChevronRight, Hash } from "lucide-react";
import { PageHeader, Modal } from "@/components/ui";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

const VARIABLES = [
  { key: "{{name}}", label: "Customer Name" },
  { key: "{{product}}", label: "Product Name" },
  { key: "{{abandon_link}}", label: "Cart Link" },
  { key: "{{order_no}}", label: "Order Number" },
];

export default function TemplateManager() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    body: "",
    category: "recovery",
    variables: [] as string[]
  });

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (e) {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleSave = async () => {
    if (!formData.name || !formData.body) return toast.error("Please fill in name and body");
    
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        body: JSON.stringify(editingTemplate ? { ...formData, id: editingTemplate.id } : formData)
      });
      if (res.ok) {
        toast.success(editingTemplate ? "Template Updated" : "Template Created");
        setShowModal(false);
        fetchTemplates();
      }
    } catch (e) {
      toast.error("Save failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      const res = await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Template Deleted");
        fetchTemplates();
      }
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  const filtered = templates.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.body.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <PageHeader 
        title="WhatsApp Template Manager" 
        subtitle="Manage dynamic message templates with variable support for automated campaigns"
        actions={
          <button 
            onClick={() => { setEditingTemplate(null); setFormData({ name: "", body: "", category: "recovery", variables: [] }); setShowModal(true); }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> New Template
          </button>
        }
      />

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input 
          className="input pl-10 h-10" 
          placeholder="Search templates..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(tpl => (
          <div key={tpl.id} className="card group hover:shadow-lg transition-all border-l-4 border-l-[#2D1E6F] flex flex-col h-full">
            <div className="p-5 flex-1">
              <div className="flex justify-between items-start mb-3">
                <div className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                  {tpl.category}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditingTemplate(tpl); setFormData(tpl); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600 transition-colors">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(tpl.id)} className="p-1.5 hover:bg-rose-50 rounded text-gray-400 hover:text-rose-600 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <h3 className="text-sm font-bold text-[#2D1E6F] mb-2 line-clamp-1">{tpl.name}</h3>
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                {tpl.body}
              </p>
            </div>
            <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[10px] text-gray-400 font-medium">Auto-variable detection active</span>
              <MessageSquare className="w-3.5 h-3.5 text-blue-300" />
            </div>
          </div>
        ))}
      </div>

      {loading && filtered.length === 0 && (
        <div className="text-center py-20 text-gray-400 text-sm italic">Loading templates...</div>
      )}

      {/* Template Modal */}
      <Modal 
        open={showModal} 
        onClose={() => setShowModal(false)} 
        title={editingTemplate ? "Edit Template" : "Create New Template"}
        maxWidth="max-w-xl"
        footer={<>
          <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Template</button>
        </>}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">Template Name</label>
            <input 
              className="input text-sm" 
              placeholder="e.g. VIP Reorder Reminder" 
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Category</label>
              <select 
                className="select text-sm"
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="recovery">Recovery</option>
                <option value="reorder">Reorder</option>
                <option value="feedback">Feedback</option>
                <option value="marketing">Marketing</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs font-bold text-gray-700">Message Body</label>
              <div className="flex items-center gap-1.5">
                {VARIABLES.map(v => (
                  <button 
                    key={v.key}
                    onClick={() => setFormData({ ...formData, body: formData.body + v.key })}
                    className="text-[9px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                  >
                    {v.key}
                  </button>
                ))}
              </div>
            </div>
            <textarea 
              className="input resize-none h-40 text-sm leading-relaxed" 
              placeholder="Hi {{name}}, we noticed you left {{product}} in your cart..."
              value={formData.body}
              onChange={e => setFormData({ ...formData, body: e.target.value })}
            />
            <div className="mt-2 text-[10px] text-gray-400 bg-gray-50 p-2 rounded border border-gray-100">
              <b>Tip:</b> Use emojis to increase engagement. Variables between double curly braces like <code>{"{{name}}"}</code> will be auto-replaced.
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
