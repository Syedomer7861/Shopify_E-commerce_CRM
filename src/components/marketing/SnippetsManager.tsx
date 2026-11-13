"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Pencil, Check, X } from "lucide-react";
import toast from "react-hot-toast";
import type { MktCommentSnippet } from "@/types";
import { marketingApi } from "@/lib/marketing-client";

// Manage the "/" canned messages used in task comment boxes.
// canManage (workspace admin) gates create / edit / delete.
export default function SnippetsManager({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<MktCommentSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", body: "" });
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await marketingApi.listSnippets());
    } catch (e: any) {
      toast.error(e.message || "Could not load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!form.title.trim() || !form.body.trim()) return toast.error("Title and message are both required");
    setBusy(true);
    try {
      const s = await marketingApi.createSnippet({ title: form.title.trim(), body: form.body });
      setItems((p) => [...p, s].sort((a, b) => a.title.localeCompare(b.title)));
      setForm({ title: "", body: "" });
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    if (!edit.title.trim() || !edit.body.trim()) return toast.error("Title and message are both required");
    try {
      const s = await marketingApi.updateSnippet(id, { title: edit.title.trim(), body: edit.body });
      setItems((p) => p.map((x) => (x.id === id ? { ...x, ...s } : x)).sort((a, b) => a.title.localeCompare(b.title)));
      setEditId(null);
    } catch (e: any) {
      toast.error(e.message || "Could not update");
    }
  }

  async function remove(id: string) {
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== id));
    setConfirmDel(null);
    try {
      await marketingApi.deleteSnippet(id);
    } catch (e: any) {
      toast.error(e.message || "Could not delete");
      setItems(prev);
    }
  }

  const cls = "w-full text-xs font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2.5 py-2";

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#5f5f5d]">
        These show up when someone types <span className="font-mono font-bold">/</span> in a task comment box.
      </p>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#5f5f5d]" /></div>
      ) : items.length === 0 ? (
        <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50 py-4 text-center">No saved messages yet</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((s) =>
            editId === s.id ? (
              <div key={s.id} className="border border-[#1c1c1c]/20 rounded-xl p-2.5 space-y-1.5">
                <input value={edit.title} onChange={(e) => setEdit((f) => ({ ...f, title: e.target.value }))} className={cls} />
                <textarea value={edit.body} onChange={(e) => setEdit((f) => ({ ...f, body: e.target.value }))} rows={3} className={cls + " resize-y"} />
                <div className="flex items-center gap-1.5">
                  <button onClick={() => saveEdit(s.id)} className="px-2.5 py-1 rounded-lg bg-[#1c1c1c] text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Check className="w-3 h-3" /> Save
                  </button>
                  <button onClick={() => setEditId(null)} className="px-2.5 py-1 rounded-lg border border-[#eceae4] text-[#5f5f5d] text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={s.id} className="flex items-start gap-2 border border-[#eceae4] rounded-xl p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-bold text-[#1c1c1c]">{s.title}</div>
                  <div className="text-[11px] text-[#5f5f5d] whitespace-pre-wrap mt-0.5">{s.body}</div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setEditId(s.id); setEdit({ title: s.title, body: s.body }); }}
                      className="text-[#5f5f5d]/50 hover:text-[#1c1c1c]"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {confirmDel === s.id ? (
                      <button onClick={() => remove(s.id)} className="text-[9px] font-black uppercase tracking-widest text-rose-500">Sure?</button>
                    ) : (
                      <button aria-label="Delete" onClick={() => setConfirmDel(s.id)} className="text-[#5f5f5d]/50 hover:text-rose-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {canManage && (
        <div className="border-t border-[#eceae4] pt-3 space-y-1.5">
          <div className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest">New saved message</div>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Short label, e.g. Approved"
            className={cls}
          />
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={3}
            placeholder="The message that gets inserted…"
            className={cls + " resize-y"}
          />
          <button
            onClick={add}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
          </button>
        </div>
      )}
      {!canManage && (
        <p className="text-[10px] text-[#5f5f5d]/60 italic">Only a workspace admin can add or change these.</p>
      )}
    </div>
  );
}
