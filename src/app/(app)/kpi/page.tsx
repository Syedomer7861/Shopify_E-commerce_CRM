"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge, Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState, AccessDenied } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { can } from "@/lib/access";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { SOURCE_BY_KEY } from "@/lib/kpi/sources";
import { weightCheck } from "@/lib/kpi/score";
import { PlansTab, type Named } from "@/components/kpi/PlansTab";
import { AssignmentsTab } from "@/components/kpi/AssignmentsTab";
import { KpiTemplateEditor, blankDraft, draftProblems, toDraft, toPayload, type KpiTemplateDraft, type TemplateRow } from "@/components/kpi/KpiTemplateEditor";

type Row = TemplateRow & {
  id: string; org_id: string | null; family_id: string; version: number; status: "draft" | "published" | "archived";
  source_template_id: string | null; source_version: number | null;
};
const COLS = "id, org_id, family_id, version, source_template_id, source_version, name, collection, description, department_hint, designation_hints, industry, period, status, visibility, kpi_template_items(name, description, source_key, measurement, direction, unit, default_target, weight, cap, threshold, missing_rule, sort_order)";
const small = "text-xs px-3 py-1.5 rounded-lg border border-[#eceae4] disabled:opacity-40";
const tab = (on: boolean) => cn("px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px", on ? "border-[#1c1c1c] text-[#1c1c1c]" : "border-transparent text-[#5f5f5d]");

function Items({ t }: { t: Row }) {
  return (
    <details className="mt-2">
      <summary className="text-xs text-[#5f5f5d] cursor-pointer">Show KPIs</summary>
      <table className="w-full text-xs mt-2">
        <thead><tr className="text-left text-[#5f5f5d]"><th className="py-1">KPI</th><th>Measured from</th><th>Better</th><th>Target</th><th className="text-right">Weight</th></tr></thead>
        <tbody>
          {[...t.kpi_template_items].sort((a, b) => a.sort_order - b.sort_order).map(i => (
            <tr key={i.sort_order} className="border-t border-[#eceae4]">
              <td className="py-1">{i.name}</td>
              <td>{!i.source_key ? "Manual evaluation" : SOURCE_BY_KEY.get(i.source_key)?.label ?? "Data source not configured"}</td>
              <td>{i.direction}</td>
              <td>{i.default_target == null ? <span className="text-amber-700">Not set</span> : `${i.default_target} ${i.unit}`}</td>
              <td className="text-right">{i.weight}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export default function KpiPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useCurrentProfile();
  const canView = can(profile, "kpi", "view") !== null;
  const canManage = can(profile, "kpi", "manage") !== null;
  const canApprove = can(profile, "kpi", "approve") !== null;
  const [view, setView] = useState<"plans" | "assignments" | "ours" | "library">("plans");
  const [ours, setOurs] = useState<Row[]>([]);
  const [library, setLibrary] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<Named[]>([]);
  const [designations, setDesignations] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; draft: KpiTemplateDraft } | null>(null);

  const load = useCallback(async () => {
    const [o, g, d, ds] = await Promise.all([
      supabase.from("kpi_templates").select(COLS).not("org_id", "is", null).order("name"),
      supabase.from("kpi_templates").select(COLS).is("org_id", null).eq("status", "published").order("collection"),
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("designations").select("id, name").order("name"),
    ]);
    setDepartments((d.data || []) as Named[]);
    setDesignations((ds.data || []) as Named[]);
    if (o.error || g.error) toast.error((o.error || g.error)!.message);
    setOurs((o.data || []) as Row[]);
    setLibrary((g.data || []) as Row[]);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { if (canView) load(); }, [canView, load]);

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
    if (!editing) return;
    const problem = draftProblems(editing.draft);
    if (problem) return toast.error(problem);
    if (await rpc("kpi_save_org_template", { p_id: editing.id, p: toPayload(editing.draft) }, editing.id ? "Template saved" : "Template created")) setEditing(null);
  }
  async function setStatus(t: Row, status: Row["status"]) {
    setBusy(true);
    const { error } = await supabase.from("kpi_templates").update({ status }).eq("id", t.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(status === "archived" ? "Archived" : "Restored");
    load();
  }

  // Our current copy of each global family, and the newest published global per family.
  const ourByFamily = new Map(ours.filter(t => t.status !== "archived" && t.source_template_id).map(t => [t.family_id, t]));
  const latestGlobal = new Map<string, Row>();
  for (const g of library) if ((latestGlobal.get(g.family_id)?.version ?? 0) < g.version) latestGlobal.set(g.family_id, g);
  const updateFor = (t: Row) => {
    const g = t.source_template_id ? latestGlobal.get(t.family_id) : undefined;
    return g && g.version > (t.source_version ?? 0) ? g : null;
  };

  if (profileLoading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (!canView) return <AccessDenied title="KPI Plans" desc="Your role doesn't include KPIs. An admin can grant it on the Roles page." />;

  const shownOurs = ours.filter(t => (showArchived ? t.status === "archived" : t.status !== "archived"));
  const shownLibrary = Array.from(latestGlobal.values());

  return (
    <div className="animate-fade-in">
      <PageHeader title="KPI Plans" subtitle="Plans with targets and weights for each department or designation, who is on which plan, and the templates behind them." />

      {editing ? (
        <div className="card p-4 mb-4 space-y-3">
          <div className="text-xs font-bold text-[#1c1c1c]">{editing.id ? "Edit template" : "New template"}</div>
          <KpiTemplateEditor value={editing.draft} onChange={draft => setEditing({ ...editing, draft })} />
          <p className="text-[10px] text-[#5f5f5d]">Changes here don&apos;t alter plans already made from this template.</p>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="text-xs font-semibold px-4 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">Save</button>
            <button onClick={() => setEditing(null)} className={small}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <nav className="flex gap-1 mb-4 border-b border-[#eceae4] overflow-x-auto whitespace-nowrap">
            <button className={tab(view === "plans")} onClick={() => setView("plans")}>Plans</button>
            <button className={tab(view === "assignments")} onClick={() => setView("assignments")}>Assignments</button>
            <button className={tab(view === "ours")} onClick={() => setView("ours")}>Our templates ({ours.filter(t => t.status !== "archived").length})</button>
            <button className={tab(view === "library")} onClick={() => setView("library")}>Template library ({shownLibrary.length})</button>
          </nav>

          {loading ? <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          : view === "plans" ? (
            <PlansTab templates={ours.filter(t => t.status !== "archived")} departments={departments} designations={designations} canManage={canManage} canApprove={canApprove} />
          ) : view === "assignments" ? (
            <AssignmentsTab me={profile?.id ?? ""} departments={departments} designations={designations} canManage={canManage} canApprove={canApprove} />
          ) : view === "ours" ? (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {canManage && (
                  <button onClick={() => setEditing({ id: null, draft: blankDraft() })} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white">
                    <Plus className="w-3.5 h-3.5" /> New template
                  </button>
                )}
                <label className="inline-flex items-center gap-2 text-xs text-[#5f5f5d]">
                  <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
                </label>
              </div>
              {shownOurs.length === 0 ? (
                <EmptyState icon={<Gauge className="w-6 h-6" />} title={showArchived ? "Nothing archived" : "No KPI templates yet"}
                  desc="Adopt one from the template library, or create your own." />
              ) : (
                <div className="space-y-2">
                  {shownOurs.map(t => {
                    const w = weightCheck(t.kpi_template_items);
                    const noTarget = t.kpi_template_items.filter(i => i.default_target == null).length;
                    const upd = updateFor(t);
                    return (
                      <div key={t.id} className="card p-4">
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-[#1c1c1c]">{t.name}</span>
                              {t.source_template_id && <span className="text-[10px] text-[#5f5f5d]">from library v{t.source_version}</span>}
                              {upd && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">v{upd.version} available</span>}
                              {t.status === "archived" && <span className="text-[10px] font-bold uppercase text-[#5f5f5d]">Archived</span>}
                            </div>
                            <div className="text-xs text-[#5f5f5d] mt-1">
                              {t.kpi_template_items.length} KPIs ·{" "}
                              <span className={w.ok ? "" : "text-amber-700 font-semibold"}>weights {w.total}{w.ok ? "" : " (must be 100)"}</span>
                              {noTarget > 0 && <span className="text-amber-700"> · {noTarget} without a target</span>}
                              {t.department_hint && ` · ${t.department_hint}`}
                            </div>
                          </div>
                          {canManage && (
                            <div className="flex flex-wrap gap-1.5">
                              {upd && <button className={small} disabled={busy} onClick={() => rpc("kpi_adopt_template", { p_source: upd.id }, `Updated to v${upd.version}; your previous copy is archived`)}>Update to v{upd.version}</button>}
                              <button className={small} onClick={() => setEditing({ id: t.id, draft: toDraft(t) })}>Edit</button>
                              <button className={small} disabled={busy} onClick={() => rpc("kpi_save_org_template", { p_id: null, p: toPayload({ ...toDraft(t), name: `${t.name} (copy)` }) }, "Duplicated")}>Duplicate</button>
                              <button className={small} disabled={busy} onClick={() => setStatus(t, t.status === "archived" ? "published" : "archived")}>{t.status === "archived" ? "Restore" : "Archive"}</button>
                            </div>
                          )}
                        </div>
                        <Items t={t} />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : shownLibrary.length === 0 ? (
            <EmptyState icon={<Gauge className="w-6 h-6" />} title="Library is empty" desc="No KPI templates have been published yet." />
          ) : (
            <div className="space-y-2">
              {shownLibrary.map(g => {
                const mine = ourByFamily.get(g.family_id);
                const manual = g.kpi_template_items.filter(i => !i.source_key).length;
                return (
                  <div key={g.id} className="card p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#1c1c1c]">{g.name}</span>
                          <span className="text-[10px] text-[#5f5f5d]">v{g.version}</span>
                          {mine && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Adopted v{mine.source_version}</span>}
                        </div>
                        <div className="text-xs text-[#5f5f5d] mt-1">
                          {g.kpi_template_items.length} KPIs · {g.kpi_template_items.length - manual} measured automatically, {manual} manual
                          {g.department_hint && ` · ${g.department_hint}`}
                        </div>
                        {g.designation_hints.length > 0 && <div className="text-[10px] text-[#5f5f5d] mt-1">Suits: {g.designation_hints.join(", ")}</div>}
                      </div>
                      {canManage && (!mine || (mine.source_version ?? 0) < g.version) && (
                        <button className={small} disabled={busy} onClick={() => rpc("kpi_adopt_template", { p_source: g.id }, mine ? `Updated to v${g.version}` : "Added to your templates. Set your targets next.")}>
                          {mine ? `Update to v${g.version}` : "Adopt"}
                        </button>
                      )}
                    </div>
                    <Items t={g} />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
