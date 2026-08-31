"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MktList, MktTask, MktStatus, MktStatusType, MktCustomField, MktFieldType } from "@/types";
import { marketingApi } from "@/lib/marketing-client";

const TYPES: MktStatusType[] = ["not_started", "active", "done"];
const FIELD_TYPES: MktFieldType[] = ["text", "number", "money", "select", "date", "checkbox", "url", "user"];
const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `s${Date.now()}`;

type Props = {
  open: boolean;
  list?: MktList;
  tasks: MktTask[]; // active-list tasks, to block removing an in-use status
  onClose: () => void;
  onSaved: () => void;
  onArchived: () => void;
};

export default function ListSettingsModal({ open, list, tasks, onClose, onSaved, onArchived }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [statuses, setStatuses] = useState<MktStatus[]>([]);
  const [fields, setFields] = useState<MktCustomField[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (open && list) {
      setName(list.name);
      setColor(list.color || "#3b82f6");
      setStatuses(list.statuses.map((s) => ({ ...s })));
      setFields((list.custom_fields ?? []).map((f) => ({ ...f })));
      setConfirmArchive(false);
    }
  }, [open, list]);

  function setField(i: number, patch: Partial<MktCustomField>) {
    setFields((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }
  function addField() {
    setFields((prev) => [...prev, { id: `f${Date.now()}`, name: "New field", type: "text" }]);
  }

  const countByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks) m[t.status] = (m[t.status] ?? 0) + 1;
    return m;
  }, [tasks]);

  function setStatus(i: number, patch: Partial<MktStatus>) {
    setStatuses((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function move(i: number, dir: -1 | 1) {
    setStatuses((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addStatus() {
    setStatuses((prev) => [...prev, { id: `s${Date.now()}`, name: "New status", color: "#8b8b8b", type: "active" }]);
  }
  function removeStatus(i: number) {
    const s = statuses[i];
    if (statuses.length <= 1) return toast.error("A list needs at least one status");
    if (countByStatus[s.id]) return toast.error(`Move the ${countByStatus[s.id]} task(s) out of "${s.name}" first`);
    setStatuses((prev) => prev.filter((_, j) => j !== i));
  }

  async function save() {
    if (!list) return;
    const cleanName = name.trim();
    if (!cleanName) return toast.error("Name required");
    // Keep ids stable for existing rows; only freshly-added rows (id starts "s"+digits) get a slug.
    const finalStatuses = statuses.map((s) => ({
      ...s,
      name: s.name.trim() || "Untitled",
      id: /^s\d{10,}$/.test(s.id) ? slug(s.name) : s.id,
    }));
    if (new Set(finalStatuses.map((s) => s.id)).size !== finalStatuses.length) {
      return toast.error("Two statuses ended up with the same name — rename one");
    }
    const finalFields = fields
      .filter((f) => f.name.trim())
      .map((f) => {
        const id = /^f\d{10,}$/.test(f.id) ? slug(f.name) : f.id;
        const out: MktCustomField = { id, name: f.name.trim(), type: f.type };
        if (f.type === "select") out.options = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
        return out;
      });
    if (new Set(finalFields.map((f) => f.id)).size !== finalFields.length) {
      return toast.error("Two custom fields ended up with the same name — rename one");
    }
    setSaving(true);
    try {
      await marketingApi.updateList(list.id, { name: cleanName, color, statuses: finalStatuses, custom_fields: finalFields });
      onSaved();
      onClose();
      toast.success("List updated");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!list) return;
    try {
      await marketingApi.archiveList(list.id);
      onArchived();
      onClose();
      toast.success("List archived");
    } catch (e: any) {
      toast.error(e.message || "Archive failed");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="List settings" maxWidth="max-w-md">
      <div className="space-y-5">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest block mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest block mb-1.5">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-9 rounded-lg border border-[#eceae4] bg-white p-0.5"
            />
          </div>
        </div>

        <div>
          <div className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest mb-2">Statuses (columns)</div>
          <div className="space-y-1.5">
            {statuses.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1">
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} className="text-[#5f5f5d]/50 hover:text-[#1c1c1c] leading-none text-[10px]">▲</button>
                  <button onClick={() => move(i, 1)} className="text-[#5f5f5d]/50 hover:text-[#1c1c1c] leading-none text-[10px]">▼</button>
                </div>
                <input
                  type="color"
                  value={s.color}
                  onChange={(e) => setStatus(i, { color: e.target.value })}
                  className="w-7 h-7 rounded border border-[#eceae4] bg-white p-0.5 flex-shrink-0"
                />
                <input
                  value={s.name}
                  onChange={(e) => setStatus(i, { name: e.target.value })}
                  className="flex-1 text-xs font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-1.5 min-w-0"
                />
                <select
                  value={s.type}
                  onChange={(e) => setStatus(i, { type: e.target.value as MktStatusType })}
                  className="text-[10px] font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{t === "not_started" ? "to do" : t}</option>
                  ))}
                </select>
                <button onClick={() => removeStatus(i)} className="text-[#5f5f5d] hover:text-rose-500 flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addStatus}
            className="mt-2 text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c] flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Status
          </button>
          <p className="text-[10px] font-medium text-[#5f5f5d]/60 mt-1.5">
            {'"done"-type columns stamp a completion time and clear it when moved back.'}
          </p>
        </div>

        <div className="border-t border-[#eceae4] pt-4">
          <div className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest mb-2">Custom fields</div>
          <div className="space-y-1.5">
            {fields.map((f, i) => (
              <div key={f.id} className="space-y-1">
                <div className="flex items-center gap-1">
                  <input
                    value={f.name}
                    onChange={(e) => setField(i, { name: e.target.value })}
                    className="flex-1 text-xs font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-1.5 min-w-0"
                  />
                  <select
                    value={f.type}
                    onChange={(e) => setField(i, { type: e.target.value as MktFieldType })}
                    className="text-[10px] font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5 capitalize"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setFields((prev) => prev.filter((_, j) => j !== i))}
                    className="text-[#5f5f5d] hover:text-rose-500 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {f.type === "select" && (
                  <input
                    value={(f.options ?? []).join(", ")}
                    onChange={(e) => setField(i, { options: e.target.value.split(",").map((s) => s.trim()) })}
                    placeholder="Options, comma separated"
                    className="w-full text-[11px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-1.5"
                  />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addField}
            className="mt-2 text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c] flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Field
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-[#eceae4] pt-4">
          {confirmArchive ? (
            <button onClick={archive} className="px-3 py-2 rounded-lg bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest">
              Archive — sure?
            </button>
          ) : (
            <button
              onClick={() => setConfirmArchive(true)}
              className="px-3 py-2 rounded-lg border border-[#eceae4] text-rose-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Archive list
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
