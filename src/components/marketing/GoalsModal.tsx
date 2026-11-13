"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Target } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MktGoal, Profile } from "@/types";
import { marketingApi } from "@/lib/marketing-client";

type Props = {
  open: boolean;
  spaceId: string;
  canManage: boolean;
  members: Profile[];
  onClose: () => void;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDaysISO = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export default function GoalsModal({ open, spaceId, canManage, members, onClose }: Props) {
  const [goals, setGoals] = useState<MktGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    target: "8",
    period_start: todayISO(),
    period_end: plusDaysISO(14),
    owner_id: "",
  });

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      setGoals(await marketingApi.listGoals(spaceId));
    } catch (e: any) {
      toast.error(e.message || "Could not load goals");
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    if (open) {
      setConfirmDel(null);
      load();
    }
  }, [open, load]);

  async function create() {
    const target = Math.round(Number(form.target));
    if (!form.title.trim()) return toast.error("Give the goal a title");
    if (!target || target <= 0) return toast.error("Target must be a positive number");
    if (form.period_end < form.period_start) return toast.error("End date is before start date");
    setSaving(true);
    try {
      const g = await marketingApi.createGoal({
        space_id: spaceId,
        title: form.title.trim(),
        target,
        period_start: form.period_start,
        period_end: form.period_end,
        owner_id: form.owner_id || null,
      });
      setGoals((prev) => [g, ...prev]);
      setForm((f) => ({ ...f, title: "", owner_id: "" }));
      toast.success("Goal added");
    } catch (e: any) {
      toast.error(e.message || "Could not create goal");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const prev = goals;
    setGoals((g) => g.filter((x) => x.id !== id));
    setConfirmDel(null);
    try {
      await marketingApi.deleteGoal(id);
    } catch (e: any) {
      toast.error(e.message || "Could not delete");
      setGoals(prev);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Goals" maxWidth="max-w-lg">
      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#5f5f5d]" /></div>
        ) : goals.length === 0 ? (
          <div className="bg-white border border-[#eceae4] rounded-2xl p-6 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50">
            No goals yet
          </div>
        ) : (
          <div className="space-y-2">
            {goals.map((g) => {
              const pct = Math.min(100, Math.round(((g.progress ?? 0) / g.target) * 100));
              const done = (g.progress ?? 0) >= g.target;
              const owner = members.find((m) => m.id === g.owner_id);
              return (
                <div key={g.id} className="bg-white border border-[#eceae4] rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-[#1c1c1c] flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-[#5f5f5d]/50" /> {g.title}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d]/60 mt-0.5">
                        {g.period_start.slice(5)} – {g.period_end.slice(5)}
                        {owner ? ` · ${owner.name || owner.email}` : " · whole Space"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn("text-[11px] font-black", done ? "text-emerald-600" : "text-[#1c1c1c]")}>
                        {g.progress ?? 0}/{g.target}
                      </span>
                      {canManage && (
                        confirmDel === g.id ? (
                          <button onClick={() => remove(g.id)} className="text-[9px] font-black uppercase tracking-widest text-rose-500">
                            Sure?
                          </button>
                        ) : (
                          <button aria-label="Delete" onClick={() => setConfirmDel(g.id)} className="text-[#5f5f5d]/40 hover:text-rose-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#eceae4] overflow-hidden mt-2">
                    <div className={cn("h-full rounded-full", done ? "bg-emerald-500" : "bg-[#1c1c1c]")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {canManage && (
          <div className="border-t border-[#eceae4] pt-4 space-y-2">
            <div className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest">New goal</div>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Ship 8 tasks this sprint"
              className="w-full text-sm font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-3 py-2"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="number" min={1} value={form.target}
                onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                className="w-16 text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
                title="Target — tasks completed"
              />
              <span className="text-[10px] font-bold text-[#5f5f5d]">tasks done</span>
              <input
                type="date" value={form.period_start}
                onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))}
                className="text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
              />
              <span className="text-[10px] text-[#5f5f5d]">–</span>
              <input
                type="date" value={form.period_end}
                onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))}
                className="text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
              />
            </div>
            <select
              value={form.owner_id}
              onChange={(e) => setForm((f) => ({ ...f, owner_id: e.target.value }))}
              className="w-full text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
            >
              <option value="">Whole Space</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
            </select>
            <button
              onClick={create}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add goal
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
