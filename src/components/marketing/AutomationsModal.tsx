"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MktList, MktAutomation, Profile } from "@/types";
import { marketingApi } from "@/lib/marketing-client";

type ActionType = "assign" | "set_priority" | "notify" | "add_subtask" | "move_to_list" | "set_field" | "set_due_date" | "run_campaign";
type DraftAction = {
  type: ActionType;
  to?: string; priority?: string; title?: string;
  list_id?: string; field?: string; value?: string; days?: string; segment?: string; name?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  list?: MktList;
  lists?: MktList[];
  members: Profile[];
};

const ACTION_LABEL: Record<ActionType, string> = {
  assign: "Assign to",
  set_priority: "Set priority",
  notify: "Notify",
  add_subtask: "Add subtask",
  move_to_list: "Move to list",
  set_field: "Set field",
  set_due_date: "Set due date",
  run_campaign: "Create campaign",
};

export default function AutomationsModal({ open, onClose, list, lists = [], members }: Props) {
  const [rules, setRules] = useState<MktAutomation[]>([]);
  const [name, setName] = useState("");
  const [event, setEvent] = useState<"status_changed" | "task_created">("status_changed");
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
    if (a.type === "move_to_list") return a.list_id ? { type: "move_to_list", list_id: a.list_id } : null;
    if (a.type === "set_field") return a.field ? { type: "set_field", field: a.field, value: a.value ?? null } : null;
    if (a.type === "set_due_date") return { type: "set_due_date", days: Number(a.days ?? 0) };
    if (a.type === "run_campaign") return a.segment?.trim() ? { type: "run_campaign", segment: a.segment.trim(), name: a.name?.trim() || undefined } : null;
    return null;
  }

  async function save() {
    if (!name.trim()) return toast.error("Name the rule");
    if (event === "status_changed" && !toStatus) return toast.error("Pick a trigger status");
    const cleaned = actions.map(cleanAction).filter(Boolean);
    if (cleaned.length === 0) return toast.error("Add at least one complete action");

    setSaving(true);
    try {
      await marketingApi.createAutomation({
        name: name.trim(),
        list_id: list?.id ?? null,
        trigger: (event === "status_changed" ? { event, to: toStatus } : { event }) as any,
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

  const listName = (id?: string) => lists.find((l) => l.id === id)?.name ?? "another list";
  const describeAction = (a: any) =>
    a.type === "assign" ? `assign ${nameOf(a.to)}`
    : a.type === "set_priority" ? `priority → ${a.priority}`
    : a.type === "notify" ? `notify ${a.to ? nameOf(a.to) : "assignees"}`
    : a.type === "add_subtask" ? `add subtask "${a.title}"`
    : a.type === "move_to_list" ? `move to ${listName(a.list_id)}`
    : a.type === "set_field" ? `set field ${a.field} = ${a.value}`
    : a.type === "set_due_date" ? `due in ${a.days}d`
    : a.type === "run_campaign" ? `draft campaign (${a.segment})`
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
                  {(r.trigger as any)?.event === "task_created"
                    ? "When a task is created"
                    : `When status → ${statusName((r.trigger as any)?.to)}`}{" "}
                  · then {(r.actions as any[]).map(describeAction).join(", ")}
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
          <div className="flex items-center gap-2 text-[11px] font-bold text-[#5f5f5d] flex-wrap">
            When
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value as any)}
              className="text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-1.5"
            >
              <option value="status_changed">status changes to</option>
              <option value="task_created">a task is created</option>
            </select>
            {event === "status_changed" && (
              <select
                value={toStatus}
                onChange={(e) => setToStatus(e.target.value)}
                className="text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-1.5"
              >
                {list?.statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {actions.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 border border-[#eceae4] rounded-lg p-1.5">
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
              {a.type === "move_to_list" && (
                <select
                  value={a.list_id ?? ""}
                  onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, list_id: e.target.value || undefined } : x)))}
                  className="flex-1 text-[11px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5"
                >
                  <option value="">Pick a list…</option>
                  {lists.filter((l) => l.id !== list?.id).map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              )}
              {a.type === "set_field" && (
                <>
                  <select
                    value={a.field ?? ""}
                    onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, field: e.target.value || undefined } : x)))}
                    className="text-[11px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5"
                  >
                    <option value="">Field…</option>
                    {(list?.custom_fields ?? []).map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <input
                    value={a.value ?? ""}
                    onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                    placeholder="Value"
                    className="flex-1 text-[11px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5 min-w-0"
                  />
                </>
              )}
              {a.type === "set_due_date" && (
                <div className="flex items-center gap-1 flex-1 text-[11px] font-bold text-[#5f5f5d]">
                  now +
                  <input
                    type="number"
                    value={a.days ?? "0"}
                    onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, days: e.target.value } : x)))}
                    className="w-16 text-[11px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5"
                  />
                  days
                </div>
              )}
              {a.type === "run_campaign" && (
                <input
                  value={a.segment ?? ""}
                  onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, segment: e.target.value } : x)))}
                  placeholder="Target segment (e.g. repeat)"
                  className="flex-1 text-[11px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5 min-w-0"
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
