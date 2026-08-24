"use client";
import { useState, useEffect } from "react";
import { Megaphone, Pin, Plus, Trash2, AlertTriangle, Info, Star, Bell, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type AnnouncementType = "Info" | "Important" | "Celebration" | "Alert";
interface Announcement { id: string; title: string; body: string; type: AnnouncementType; pinned: boolean; date: string; author: string; }

const TYPE_STYLES: Record<AnnouncementType, { bg: string; text: string; icon: any }> = {
  Info: { bg: "bg-sky-50 border-sky-200", text: "text-sky-700", icon: Info },
  Important: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", icon: AlertTriangle },
  Celebration: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", icon: Star },
  Alert: { bg: "bg-rose-50 border-rose-200", text: "text-rose-700", icon: Bell },
};

interface Props { announcements: any[]; onRefresh: () => void; }

export default function Announcements({ announcements: dbAnnouncements, onRefresh }: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newA, setNewA] = useState({ title: "", body: "", type: "Info" as AnnouncementType, pinned: false, author: "HR Intelligence" });
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    setAnnouncements(dbAnnouncements.map(a => ({
      id: a.id,
      title: a.title,
      body: a.body,
      type: a.type as AnnouncementType,
      pinned: a.is_pinned,
      date: a.created_at.split("T")[0],
      author: a.author_name || "HR Intelligence"
    })));
  }, [dbAnnouncements]);

  const handleAction = async (data: any, action = "insert") => {
    try {
      const res = await fetch("/api/hr/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "announcement", action, data })
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        console.error("HR API Error Details:", result.error);
        throw new Error(result.error || "Action failed");
      }
      
      if (action === "insert" || action === "update") {
        setNewA({ title: "", body: "", type: "Info", pinned: false, author: "HR Intelligence" });
        setShowForm(false);
        setEditId(null);
      }
      toast.success(`Announcement ${action === 'delete' ? 'deleted' : action === 'update' ? 'updated' : 'posted'} successfully`);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to process announcement");
    }
  };

  const add = () => {
    if (!newA.title || !newA.body) return;
    if (editId) {
      handleAction({
        id: editId,
        title: newA.title,
        body: newA.body,
        type: newA.type,
        is_pinned: newA.pinned,
        author_name: newA.author
      }, "update");
    } else {
      handleAction({
        title: newA.title,
        body: newA.body,
        type: newA.type,
        is_pinned: newA.pinned,
        author_name: newA.author
      });
    }
  };

  const startEdit = (a: Announcement) => {
    setNewA({ title: a.title, body: a.body, type: a.type, pinned: a.pinned, author: a.author });
    setEditId(a.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pinned = announcements.filter(a => a.pinned);
  const rest = announcements.filter(a => !a.pinned);

  return (
    <div className="space-y-5">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest">Company Announcements</h3>
          <p className="text-xs text-gray-400 mt-0.5">Visible to all agents on their dashboard sidebar.</p>
        </div>
        <button onClick={() => { 
          if (showForm && editId) {
            setEditId(null);
            setNewA({ title: "", body: "", type: "Info", pinned: false, author: "HR Intelligence" });
          } else {
            setShowForm(s => !s);
          }
        }} className="btn-primary gap-2 text-xs px-4 py-2">
          {showForm && editId ? "Cancel Edit" : <><Plus className="w-3.5 h-3.5" /> New Announcement</>}
        </button>
      </div>

      {/* Compose Form */}
      {showForm && (
        <div className="card p-5 border-2 border-[#1c1c1c]/10 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <h4 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest">
            {editId ? "Edit Announcement" : "Compose Announcement"}
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Title</label>
              <input className="input w-full text-sm" placeholder="e.g., Office Holiday Notice" value={newA.title} onChange={e => setNewA(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Author Name</label>
              <input className="input w-full text-sm font-bold" placeholder="HR Intelligence" value={newA.author} onChange={e => setNewA(p => ({ ...p, author: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Message</label>
              <textarea className="input w-full text-sm min-h-[80px]" placeholder="Type announcement here..." value={newA.body} onChange={e => setNewA(p => ({ ...p, body: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(["Info", "Important", "Celebration", "Alert"] as AnnouncementType[]).map(t => {
                  const S = TYPE_STYLES[t];
                  return (
                    <button key={t} onClick={() => setNewA(p => ({ ...p, type: t }))}
                      className={cn("py-2 text-[10px] font-black rounded-lg border transition-all flex items-center justify-center gap-1.5",
                        newA.type === t ? `${S.bg} ${S.text} border-current` : "border-gray-200 text-gray-400")}>
                      <S.icon className="w-3 h-3" /> {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer p-3 bg-gray-50 rounded-xl">
                <input type="checkbox" checked={newA.pinned} onChange={e => setNewA(p => ({ ...p, pinned: e.target.checked }))} className="accent-[#1c1c1c]" />
                <div>
                  <div className="text-xs font-bold text-[#1c1c1c]">Pin to top</div>
                  <div className="text-[9px] text-gray-400">Show at the top of the board always</div>
                </div>
              </label>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={add} className="btn-primary text-xs px-6 py-2.5 gap-2 flex-1">
              <Megaphone className="w-3.5 h-3.5" /> {editId ? "Update Announcement" : "Post Announcement"}
            </button>
            <button onClick={() => {
              setShowForm(false);
              setEditId(null);
              setNewA({ title: "", body: "", type: "Info", pinned: false, author: "HR Intelligence" });
            }} className="btn-secondary text-xs px-4 py-2.5">Cancel</button>
          </div>
        </div>
      )}

      {/* Pinned */}
      {pinned.length > 0 && (
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
            <Pin className="w-3 h-3" /> Pinned
          </p>
          <div className="space-y-3">
            {pinned.map(a => <AnnouncementCard key={a.id} a={a} onEdit={() => startEdit(a)} onDelete={() => handleAction({ id: a.id }, "delete")} onTogglePin={() => handleAction({ id: a.id, is_pinned: !a.pinned }, "update")} />)}
          </div>
        </div>
      )}

      {/* All Others */}
      <div>
        {pinned.length > 0 && <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Recent</p>}
        <div className="space-y-3">
          {rest.map(a => <AnnouncementCard key={a.id} a={a} onEdit={() => startEdit(a)} onDelete={() => handleAction({ id: a.id }, "delete")} onTogglePin={() => handleAction({ id: a.id, is_pinned: !a.pinned }, "update")} />)}
        </div>
      </div>

      {announcements.length === 0 && (
        <div className="card p-12 text-center">
          <Megaphone className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-400">No announcements posted yet.</p>
        </div>
      )}
    </div>
  );
}

function AnnouncementCard({ a, onEdit, onDelete, onTogglePin }: { a: Announcement; onEdit: () => void; onDelete: () => void; onTogglePin: () => void }) {
  // a.type missing or outside the enum crashed this component entirely
  // (TypeError: Cannot read properties of undefined (reading 'bg')).
  const S = TYPE_STYLES[a.type] || TYPE_STYLES.Info;
  return (
    <div className={cn("card p-5 border transition-all hover:shadow-md", S.bg, a.pinned && "shadow-sm")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0", S.bg, "border", S.text)}>
            <S.icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="text-sm font-black text-[#1c1c1c]">{a.title}</h4>
              {a.pinned && <Pin className="w-3 h-3 text-amber-500" />}
              <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full border", S.text, S.bg)}>{a.type}</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">{a.body}</p>
            <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase tracking-tighter opacity-60">{a.author} · {a.date}</p>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onTogglePin} className={cn("p-1.5 rounded-lg transition-colors", a.pinned ? "text-amber-500 bg-amber-50" : "text-gray-300 hover:text-amber-500 hover:bg-amber-50")} title={a.pinned ? "Unpin" : "Pin"}>
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-colors" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
