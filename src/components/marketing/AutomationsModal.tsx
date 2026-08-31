"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MktList, MktAutomation, Profile } from "@/types";
import { marketingApi } from "@/lib/marketing-client";

type ActionType = "assign" | "set_priority" | "notify" | "add_subtask";
type DraftAction = { type: ActionType; to?: string; priority?: string; title?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  list?: MktList;
  members: Profile[];
};

const ACTION_LABEL: Record<ActionType, string> = {
  assign: "Assign to",
  set_priority: "Set priority",
  notify: "Notify",
  add_subtask: "Add subtask",
};

export default function AutomationsModal({ open, onClose, list, members }: Props) {
  const [rules, setRules] = useState<MktAutomation[]>([]);
  const [name, setName] = useState("");
  const [toStatus, setToStatus] = useState("");
  const [actions, setActions] = useState<DraftAction[]>([{ type: "notify" }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRules(await marketingApi.listAutomations(list?.id));
    } catch (e: any) {
      toast.error(e.message || "Could not load automations");
    }
  }, [list?.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (list && !toStatus) setToStatus(list.statuses[0]?.id ?? "");
  }, [list, toStatus]);

  const nameOf = (id?: string) => members.find((m) => m.id === id)?.name || members.find((m) => m.id === id)?.email || id || "?";
  const statusName = (id?: string) => list?.statuses.find((s) => s.id === id)?.name ?? id ?? "any";

  function cleanAction(a: DraftAction) {
    if (a.type === "assign") return a.to ? { type: "assign", to: a.to } : null;
    if (a.type === "set_priority") return { type: "set_priority", priority: a.priority ?? "high" };
    if (a.type === "notify") return a.to ? { type: "notify", to: a.to } : { type: "notify" };
    if (a.type === "add_subtask") return a.title?.trim() ? { type: "add_subtask", title: a.title.trim() } : null;
    return null;
  }

  async function save() {
    if (!name.trim()) return toast.error("Name the rule");
    if (!toStatus) return toast.error("Pick a trigger status");
    const cleaned = actions.map(cleanAction).filter(Boolean);
    if (cleaned.length === 0) return toast.error("Add at least one complete action");

    setSaving(true);
    try {
      await marketingApi.createAutomation({
        name: name.trim(),
        list_id: list?.id ?? null,
        trigger: { event: "status_changed", to: toStatus } as any,
        actions: cleaned as any,
      });
      setName("");
      setActions([{ type: "notify" }]);
      await load();
      toast.success("Automation saved");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: MktAutomation) {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    try {
      await marketingApi.updateAutomation(rule.id, { enabled: !rule.enabled });
    } catch (e: any) {
      toast.error(e.message);
      load();
    }
  }

  async function remove(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
    try {
      await marketingApi.deleteAutomation(id);
    } catch (e: any) {
      toast.error(e.message);
      load();
    }
  }

  const describeAction = (a: any) =>
    a.type === "assign" ? `assign ${nameOf(a.to)}`
    : a.type === "set_priority" ? `priority → ${a.priority}`
    : a.type === "notify" ? `notify ${a.to ? nameOf(a.to) : "assignees"}`
    : a.type === "add_subtask" ? `add subtask "${a.title}"`
    : a.type;

  return (
    <Modal open={open} onClose={onClose} title="Automations" maxWidth="max-w-lg">
      <div className="space-y-5">
        <div className="space-y-2">
          {rules.length === 0 && (
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50 py-2 text-center">No rules yet</p>
          )}
          {rules.map((r) => (
            <div key={r.id} className="p-3 rounded-xl border border-[#eceae4] flex items-start gap-3">
              <input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} className="mt-1" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-[#1c1c1c]">{r.name}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d]/60 mt-0.5">
                  When status → {statusName((r.trigger as any)?.to)} · then {(r.actions as any[]).map(describeAction).join(", ")}
                </div>
                {!r.list_id && <div className="text-[9px] font-bold uppercase tracking-widest text-[#5f5f5d]/40 mt-0.5">All lists</div>}
              </div>
              <button onClick={() => remove(r.id)} className="text-[#5f5f5d] hover:text-rose-500 flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-[#eceae4] pt-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d]/60 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> New rule {list ? `· ${list.name}` : ""}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rule name — e.g. Route to review"
            className="w-full text-xs font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-3 py-2"
          />
          <div className="flex items-center gap-2 text-[11px] font-bold text-[#5f5f5d]">
            When status →
            <select
              value={toStatus}
              onChange={(e) => setToStatus(e.target.value)}
              className="text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-1.5"
            >
              {list?.statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                value={a.type}
                onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { type: e.target.value as ActionType } : x)))}
                className="text-[10px] font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5"
              >
                {(Object.keys(ACTION_LABEL) as ActionType[]).map((t) => (
                  <option key={t} value={t}>{ACTION_LABEL[t]}</option>
                ))}
              </select>

              {(a.type === "assign" || a.type === "notify") && (
                <select
                  value={a.to ?? ""}
                  onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, to: e.target.value || undefined } : x)))}
                  className="flex-1 text-[11px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5"
                >
                  <option value="">{a.type === "notify" ? "Assignees" : "Pick person…"}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name || m.email}</option>
                  ))}
                </select>
              )}
              {a.type === "set_priority" && (
                <select
                  value={a.priority ?? "high"}
                  onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, priority: e.target.value } : x)))}
                  className="flex-1 text-[11px] font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5 capitalize"
                >
                  {["urgent", "high", "normal", "low"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
              {a.type === "add_subtask" && (
                <input
                  value={a.title ?? ""}
                  onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  placeholder="Subtask title"
                  className="flex-1 text-[11px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5"
                />
              )}

              {actions.length > 1 && (
                <button
                  onClick={() => setActions((prev) => prev.filter((_, j) => j !== i))}
                  className="text-[#5f5f5d] hover:text-rose-500 flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setActions((prev) => [...prev, { type: "notify" }])}
              className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c] flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Action
            </button>
            <button
              onClick={save}
              disabled={saving}
              className={cn(
                "px-3 py-2 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
              )}
            >
              {saving ? "Saving…" : "Save rule"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
