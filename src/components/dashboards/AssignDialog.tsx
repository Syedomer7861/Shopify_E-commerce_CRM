"use client";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { Modal } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { TARGETS, targetLabel, type Dashboard, type Directory, type TargetType } from "@/lib/dashboards";

/**
 * Who lands on a dashboard. One dashboard per target; picking a target that
 * already has another dashboard moves it here. Assignment never changes
 * permissions: it only picks the layout.
 */
export function AssignDialog({ dashboard, dir, onClose, onChanged }: { dashboard: Dashboard; dir: Directory; onClose: () => void; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [type, setType] = useState<TargetType>("role");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = dir.assignments.filter(a => a.dashboard_id === dashboard.id);
  const options = type === "role" ? dir.roles.map(r => ({ id: r, name: r.replace(/_/g, " ") }))
    : type === "employee" ? dir.people.map(p => ({ id: p.id, name: p.name ?? "—" }))
    : type === "branch" ? dir.branches : type === "department" ? dir.departments : dir.designations;
  const taken = dir.assignments.find(a => a.target_type === type && a.target_key === key && a.dashboard_id !== dashboard.id);
  const takenBy = taken ? dir.dashboards.find(d => d.id === taken.dashboard_id)?.name : null;

  async function add() {
    if (!key) return;
    if (takenBy && !await confirmDialog(`This ${type} currently gets "${takenBy}". Move it to "${dashboard.name}"?`)) return;
    setBusy(true);
    const { error } = await supabase.from("dashboard_assignments")
      .upsert({ org_id: dashboard.org_id, dashboard_id: dashboard.id, target_type: type, target_key: key }, { onConflict: "org_id,target_type,target_key" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Assigned"); setKey(""); onChanged();
  }
  async function remove(id: string) {
    setBusy(true);
    const { error } = await supabase.from("dashboard_assignments").delete().eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    onChanged();
  }

  return (
    <Modal open onClose={onClose} title={`Assign "${dashboard.name}"`}>
      <div className="space-y-4 text-xs">
        {dashboard.status !== "published" && <p className="text-amber-700">Not published yet: people assigned here keep their current home until you publish.</p>}
        <p className="text-[#5f5f5d]">If someone matches several assignments, the most specific wins: employee, then designation, department, branch, role.</p>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Assign to" value={type} onChange={e => { setType(e.target.value as TargetType); setKey(""); }} className="h-9 px-2 bg-white border border-[#ebece6] rounded-lg">
            {TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select aria-label="Target" value={key} onChange={e => setKey(e.target.value)} className="h-9 px-2 bg-white border border-[#ebece6] rounded-lg flex-1 min-w-40">
            <option value="">Choose…</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button onClick={add} disabled={busy || !key} className="h-9 px-4 rounded-lg bg-[#1c1c1c] text-white font-semibold disabled:opacity-50">Assign</button>
        </div>
        {takenBy && <p className="text-amber-700">Currently assigned to “{takenBy}”.</p>}
        <div>
          <div className="font-bold text-[#1c1c1c] mb-1">Assigned to</div>
          {mine.length === 0 ? <p className="text-[#5f5f5d]">Nobody yet.</p> : (
            <ul className="space-y-1">
              {mine.map(a => (
                <li key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-[#ebece6]">
                  <span className="text-[10px] uppercase font-bold text-[#5f5f5d] w-24">{TARGETS.find(t => t.value === a.target_type)?.label}</span>
                  <span className="flex-1 font-semibold capitalize">{targetLabel(dir, a.target_type, a.target_key)}</span>
                  <button aria-label="Remove" disabled={busy} onClick={() => remove(a.id)} className="p-1 rounded text-rose-600"><X className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
