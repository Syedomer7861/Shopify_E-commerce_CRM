"use client";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { SOURCE_BY_KEY } from "@/lib/kpi/sources";
import { weightCheck } from "@/lib/kpi/score";
import { PERIODS, type KpiItem } from "./KpiTemplateEditor";

export type Named = { id: string; name: string };
export type OrgTemplate = { id: string; name: string; version: number; period: string; department_hint: string | null; kpi_template_items: (KpiItem & { sort_order: number })[] };
type PlanItem = Omit<KpiItem, "default_target"> & { target: number | null };
type Plan = {
  id: string; name: string; template_id: string | null; template_version: number | null; department_id: string | null; designation_id: string | null;
  period: string; status: "draft" | "active" | "archived"; approved_at: string | null; version: number; previous_plan_id: string | null;
  kpi_plan_items: (PlanItem & { sort_order: number })[]; kpi_assignments: { status: string }[];
};
type Draft = Omit<Plan, "id" | "status" | "approved_at" | "version" | "previous_plan_id" | "kpi_plan_items" | "kpi_assignments"> & { id: string | null; items: PlanItem[] };

const input = "h-9 px-2 bg-white border border-[#ebece6] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";
const small = "text-xs px-3 py-1.5 rounded-lg border border-[#ebece6] disabled:opacity-40";
const STATUS: Record<Plan["status"], string> = { draft: "bg-[#eef4fc] text-[#3d66a6]", active: "bg-[#ecf8f1] text-[#2f8a5f]", archived: "bg-[#f0f0ec] text-[#5f5f5d]" };
const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

const fromTemplate = (t: OrgTemplate): Draft => ({
  id: null, name: t.name, template_id: t.id, template_version: t.version, department_id: null, designation_id: null, period: t.period,
  items: [...t.kpi_template_items].sort((a, b) => a.sort_order - b.sort_order).map(({ default_target, sort_order: _s, ...i }) => ({ ...i, target: default_target })),
});
const fromPlan = (p: Plan): Draft => ({
  id: p.id, name: p.name, template_id: p.template_id, template_version: p.template_version, department_id: p.department_id,
  designation_id: p.designation_id, period: p.period,
  items: [...p.kpi_plan_items].sort((a, b) => a.sort_order - b.sort_order).map(({ sort_order: _s, ...i }) => i),
});
/** Targets a plan still needs before it can go live (boolean KPIs need none). */
const missingTargets = (items: PlanItem[]) => items.filter(i => i.measurement !== "boolean" && !(i.target && i.target > 0)).length;

export function PlansTab({ templates, departments, designations, canManage, canApprove }: {
  templates: OrgTemplate[]; departments: Named[]; designations: Named[]; canManage: boolean; canApprove: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pick, setPick] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("kpi_plans")
      .select("id, name, template_id, template_version, department_id, designation_id, period, status, approved_at, version, previous_plan_id, kpi_plan_items(name, description, source_key, measurement, direction, unit, target, weight, cap, threshold, missing_rule, sort_order), kpi_assignments(status)")
      .order("name");
    if (error) toast.error(error.message);
    setPlans((data || []) as Plan[]);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function rpc(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok);
    load();
    return true;
  }
  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error("Name the plan");
    if (draft.items.length === 0) return toast.error("A plan needs at least one KPI");
    const { id, items, ...rest } = draft;
    if (await rpc("kpi_save_plan", { p_id: id, p: { ...rest, name: draft.name.trim(), items } }, id ? "Plan saved" : "Plan created as a draft")) setDraft(null);
  }
  async function activate(p: Plan) {
    const w = weightCheck(p.kpi_plan_items);
    if (!w.ok) return toast.error(`Weights total ${w.total}, must be 100`);
    const m = missingTargets(p.kpi_plan_items);
    if (m) return toast.error(`${m} KPI(s) still need a target`);
    const prev = plans.find(x => x.id === p.previous_plan_id && x.status === "active");
    const moving = prev?.kpi_assignments.filter(a => a.status === "active").length ?? 0;
    if (prev && !await confirmDialog(`Approve version ${p.version}? ${moving} employee(s) move from version ${prev.version} starting today, and version ${prev.version} is archived. Past evaluations stay as they are.`)) return;
    rpc("kpi_set_plan_status", { p_id: p.id, p_status: "active" }, prev ? `Version ${p.version} is live` : "Plan approved and active");
  }

  const nameOf = (list: Named[], id: string | null) => list.find(x => x.id === id)?.name;
  const setItem = (i: number, p: Partial<PlanItem>) => draft && setDraft({ ...draft, items: draft.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });

  if (loading) return <div className="py-12 text-center text-[#9a9a94]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  if (draft) {
    const w = weightCheck(draft.items);
    const m = missingTargets(draft.items);
    return (
      <div className="card p-4 space-y-3">
        <div className="text-xs font-bold text-[#1c1c1c]">{draft.id ? "Edit plan" : "New plan"}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={input} maxLength={120} placeholder="Plan name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          <select className={input} value={draft.period} onChange={e => setDraft({ ...draft, period: e.target.value })}>
            {PERIODS.map(p => <option key={p} value={p}>{p.replace("_", "-")} review</option>)}
          </select>
          <select className={input} value={draft.department_id ?? ""} onChange={e => setDraft({ ...draft, department_id: e.target.value || null })} aria-label="Department">
            <option value="">Any department</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className={input} value={draft.designation_id ?? ""} onChange={e => setDraft({ ...draft, designation_id: e.target.value || null })} aria-label="Designation">
            <option value="">Any designation</option>
            {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <p className="text-[10px] text-[#5f5f5d]">New and moved employees whose designation (or, failing that, department) matches an active plan get it suggested for approval.</p>
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-[#1c1c1c]">Targets and weights</span>
          <span className={cn("font-semibold", w.ok && !m ? "text-[#2f8a5f]" : "text-amber-700")}>Weights {w.total}{m ? ` · ${m} without target` : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[#5f5f5d]"><th className="py-1">KPI</th><th>Measured from</th><th>Target</th><th>Weight %</th><th /></tr></thead>
            <tbody>
              {draft.items.map((it, i) => (
                <tr key={i} className="border-t border-[#ebece6]">
                  <td className="py-1 pr-2"><input className={cn(input, "w-full min-w-[140px]")} value={it.name} onChange={e => setItem(i, { name: e.target.value })} /></td>
                  <td className="pr-2">{!it.source_key ? "Manual evaluation" : SOURCE_BY_KEY.get(it.source_key)?.label ?? "Data source not configured"}</td>
                  <td className="pr-2 whitespace-nowrap">{it.measurement === "boolean" ? "Yes / no" : (
                    <><input className={cn(input, "w-24")} inputMode="decimal" value={it.target ?? ""} onChange={e => setItem(i, { target: num(e.target.value) })} /> <span className="text-[#5f5f5d]">{it.unit}{it.direction === "lower" ? " or less" : ""}</span></>
                  )}</td>
                  <td className="pr-2"><input className={cn(input, "w-20")} inputMode="decimal" value={it.weight} onChange={e => setItem(i, { weight: num(e.target.value) ?? 0 })} /></td>
                  <td><button aria-label="Remove KPI" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })} className="p-1.5 rounded-lg border border-[#ebece6] text-red-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="text-xs font-semibold px-4 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">Save</button>
          <button onClick={() => setDraft(null)} className={small}>Cancel</button>
        </div>
      </div>
    );
  }

  const shown = plans.filter(p => (showArchived ? p.status === "archived" : p.status !== "archived"));
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {canManage && (
          <>
            <select className={input} value={pick} onChange={e => setPick(e.target.value)} aria-label="Template">
              <option value="">Start from template...</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button disabled={!pick} onClick={() => { const t = templates.find(x => x.id === pick); if (t) { setDraft(fromTemplate(t)); setPick(""); } }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" /> New plan
            </button>
          </>
        )}
        <label className="inline-flex items-center gap-2 text-xs text-[#5f5f5d]">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={<ClipboardList className="w-6 h-6" />} title={showArchived ? "Nothing archived" : "No plans yet"}
          desc={templates.length ? "Pick one of your templates above to start a plan." : "Adopt or create a template first, then build a plan from it."} />
      ) : (
        <div className="space-y-2">
          {shown.map(p => {
            const w = weightCheck(p.kpi_plan_items);
            const m = missingTargets(p.kpi_plan_items);
            const active = p.kpi_assignments.filter(a => a.status === "active").length;
            const waiting = p.kpi_assignments.filter(a => a.status === "suggested").length;
            const who = [nameOf(designations, p.designation_id), nameOf(departments, p.department_id)].filter(Boolean).join(" · ") || "Not tied to a department";
            return (
              <div key={p.id} className="card p-4 flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", STATUS[p.status])}>{p.status}</span>
                    <span className="text-sm font-semibold text-[#1c1c1c]">{p.name}</span>
                    {p.version > 1 && <span className="text-[10px] font-bold text-[#5f5f5d]">v{p.version}</span>}
                  </div>
                  <div className="text-xs text-[#5f5f5d] mt-1">
                    {who} · {p.kpi_plan_items.length} KPIs · {p.period.replace("_", "-")} · {active} assigned{waiting ? `, ${waiting} awaiting approval` : ""}
                    {p.status === "draft" && (!w.ok || m > 0) && <span className="text-amber-700"> · {!w.ok ? `weights ${w.total}` : ""}{!w.ok && m ? ", " : ""}{m ? `${m} without target` : ""}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {canManage && p.status === "draft" && p.kpi_assignments.length === 0 && <button className={small} onClick={() => setDraft(fromPlan(p))}>Edit</button>}
                  {canManage && (p.status !== "draft" || p.kpi_assignments.length > 0) && !plans.some(x => x.previous_plan_id === p.id && x.status === "draft") && (
                    <button className={small} disabled={busy} title="In-use plans change through a new version, so history stays intact" onClick={() => rpc("kpi_plan_new_version", { p_id: p.id }, "New version created as a draft")}>New version</button>
                  )}
                  {canApprove && p.status === "draft" && <button className={small} disabled={busy} onClick={() => activate(p)}>Approve</button>}
                  {canApprove && p.status === "active" && <button className={small} disabled={busy || active > 0} title={active ? "End its assignments first" : undefined} onClick={() => rpc("kpi_set_plan_status", { p_id: p.id, p_status: "draft" }, "Back to draft")}>Unapprove</button>}
                  {canManage && p.status !== "archived" && <button className={small} disabled={busy || active > 0} title={active ? "End its assignments first" : undefined} onClick={() => rpc("kpi_set_plan_status", { p_id: p.id, p_status: "archived" }, "Archived")}>Archive</button>}
                  {canManage && p.status === "archived" && <button className={small} disabled={busy} onClick={() => rpc("kpi_set_plan_status", { p_id: p.id, p_status: "draft" }, "Restored as a draft")}>Restore</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
