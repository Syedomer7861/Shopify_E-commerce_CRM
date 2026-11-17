"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gauge, Loader2, Plus, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { SOURCE_BY_KEY } from "@/lib/kpi/sources";
import { weightCheck } from "@/lib/kpi/score";
import { KpiTemplateEditor, blankDraft, draftProblems, toDraft, toPayload, MEASUREMENTS, type KpiItem, type KpiTemplateDraft } from "@/components/kpi/KpiTemplateEditor";

type Template = {
  id: string; family_id: string; version: number; name: string; collection: string; description: string;
  department_hint: string | null; designation_hints: string[]; industry: string | null; period: string;
  status: "draft" | "published" | "archived"; visibility: "public" | "hidden"; updated_at: string;
  kpi_template_items: (KpiItem & { sort_order: number })[];
};

const STATUS_STYLE: Record<Template["status"], string> = {
  draft: "bg-sky-50 text-sky-700", published: "bg-emerald-50 text-emerald-700", archived: "bg-gray-100 text-[#5f5f5d]",
};
const small = "text-xs px-3 py-1.5 rounded-lg border border-[#ebece6] disabled:opacity-40";

/** Imported JSON is untrusted: keep known fields only and let the DB checks do the rest. */
function parseImport(raw: unknown): KpiTemplateDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !Array.isArray(r.items)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const items = r.items.map((x): KpiItem | null => {
    const i = (x ?? {}) as Record<string, unknown>;
    if (typeof i.name !== "string" || !MEASUREMENTS.includes(i.measurement as KpiItem["measurement"])) return null;
    return {
      name: i.name, description: str(i.description), source_key: typeof i.source_key === "string" && i.source_key ? i.source_key : null,
      measurement: i.measurement as KpiItem["measurement"], direction: i.direction === "lower" ? "lower" : "higher", unit: str(i.unit),
      default_target: n(i.default_target), weight: n(i.weight) ?? 0, cap: n(i.cap), threshold: n(i.threshold),
      missing_rule: i.missing_rule === "zero" ? "zero" : "exclude",
    };
  });
  if (items.some(i => i === null)) return null;
  return {
    name: r.name, collection: str(r.collection), description: str(r.description), department_hint: str(r.department_hint),
    designation_hints: Array.isArray(r.designation_hints) ? r.designation_hints.filter((s): s is string => typeof s === "string") : [],
    industry: str(r.industry), period: str(r.period) || "monthly", visibility: r.visibility === "hidden" ? "hidden" : "public",
    items: items as KpiItem[],
  };
}

export default function SuperAdminKpiLibrary() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Template[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; draft: KpiTemplateDraft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<"active" | "archived">("active");
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [{ data, error }, u] = await Promise.all([supabase.from("kpi_templates")
      .select("id, family_id, version, name, collection, description, department_hint, designation_hints, industry, period, status, visibility, updated_at, kpi_template_items(name, description, source_key, measurement, direction, unit, default_target, weight, cap, threshold, missing_rule, sort_order)")
      .is("org_id", null).order("collection").order("version", { ascending: false }),
      supabase.rpc("platform_kpi_usage")]);
    if (error) toast.error(error.message);
    // Before migration 20261117e the function is missing: usage just stays blank.
    setUsage(Object.fromEntries(((u.data || []) as { template_id: string; orgs: number }[]).map(r => [r.template_id, Number(r.orgs)])));
    setRows((data || []) as Template[]);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function call<T>(fn: string, args: Record<string, unknown>, ok: string): Promise<T | null> {
    setBusy(true);
    const { data, error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast.error(error.message); return null; }
    toast.success(ok);
    load();
    return data as T;
  }

  async function save() {
    if (!editing) return;
    const problem = draftProblems(editing.draft);
    if (problem) return toast.error(problem);
    const id = await call<string>("platform_kpi_save_template", { p_id: editing.id, p: toPayload(editing.draft) }, editing.id ? "Draft saved" : "Draft created");
    if (id) setEditing(null);
  }
  async function newVersion(t: Template) {
    const id = await call<string>("platform_kpi_copy", { p_id: t.id, p_new_version: true }, `Version ${t.version + 1} created as a draft`);
    if (id) setEditing({ id, draft: toDraft(t) });
  }
  function setStatus(t: Template, s: Template["status"]) {
    if (s === "published" && !weightCheck(t.kpi_template_items).ok) return toast.error("Weights must total 100 before publishing");
    if (s === "archived" && !window.confirm(`Archive "${t.name}" v${t.version}? Organisations that already adopted it keep their copy.`)) return;
    call("platform_kpi_set_status", { p_id: t.id, p_status: s }, s === "published" ? "Published" : s === "archived" ? "Archived" : "Moved back to draft");
  }
  function exportJson(t: Template) {
    const blob = new Blob([JSON.stringify({ format: "kpi-template/1", ...toPayload(toDraft(t)) }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${t.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-v${t.version}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importJson(file: File) {
    if (file.size > 200_000) return toast.error("File is too large");
    let draft: KpiTemplateDraft | null = null;
    try { draft = parseImport(JSON.parse(await file.text())); } catch { /* handled below */ }
    if (!draft) return toast.error("Not a KPI template file");
    setEditing({ id: null, draft });
    toast("Check the imported template, then save it as a draft");
  }

  const shown = rows.filter(t => (show === "archived" ? t.status === "archived" : t.status !== "archived")
    && (!q.trim() || `${t.name} ${t.collection} ${t.department_hint ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const counts = { published: rows.filter(t => t.status === "published").length, draft: rows.filter(t => t.status === "draft").length };

  if (loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div>
      <PageHeader title="KPI library" subtitle={`Global KPI templates organisations can adopt. ${counts.published} published, ${counts.draft} draft.`} />

      {editing ? (
        <div className="card p-4 mb-4 space-y-3">
          <div className="text-xs font-bold text-[#1c1c1c]">{editing.id ? "Edit draft" : "New template"}</div>
          <KpiTemplateEditor global value={editing.draft} onChange={draft => setEditing({ ...editing, draft })} />
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="text-xs font-semibold px-4 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">Save draft</button>
            <button onClick={() => setEditing(null)} className={small}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setEditing({ id: null, draft: blankDraft() })} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white">
            <Plus className="w-3.5 h-3.5" /> New template
          </button>
          <button onClick={() => fileRef.current?.click()} className={cn(small, "inline-flex items-center gap-1.5")}><Upload className="w-3.5 h-3.5" /> Import JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importJson(f); }} />
          <input className="h-9 px-3 bg-white border border-[#ebece6] rounded-lg text-sm flex-1 min-w-[160px]" placeholder="Search templates" value={q} onChange={e => setQ(e.target.value)} />
          <select className="h-9 px-2 bg-white border border-[#ebece6] rounded-lg text-sm" value={show} onChange={e => setShow(e.target.value as typeof show)}>
            <option value="active">Published and drafts</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState icon={<Gauge className="w-6 h-6" />} title="No templates here" desc="Create a template, or import one exported from another environment." />
      ) : (
        <div className="space-y-2">
          {shown.map(t => {
            const w = weightCheck(t.kpi_template_items);
            const manual = t.kpi_template_items.filter(i => !i.source_key).length;
            const unconfigured = t.kpi_template_items.filter(i => i.source_key && !SOURCE_BY_KEY.has(i.source_key)).length;
            const newer = rows.some(r => r.family_id === t.family_id && r.version > t.version);
            return (
              <div key={t.id} className="card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", STATUS_STYLE[t.status])}>{t.status}</span>
                      <span className="text-sm font-semibold text-[#1c1c1c]">{t.name}</span>
                      <span className="text-[10px] text-[#5f5f5d]">v{t.version}{newer ? " · newer version exists" : ""}</span>
                      {t.visibility === "hidden" && <span className="text-[10px] font-bold uppercase text-amber-600">Hidden</span>}
                    </div>
                    <div className="text-xs text-[#5f5f5d] mt-1">
                      {t.kpi_template_items.length} KPIs · {t.kpi_template_items.length - manual} automatic, {manual} manual
                      {unconfigured > 0 && `, ${unconfigured} data source not configured`} · weights {w.total}
                      {t.department_hint && ` · ${t.department_hint}`} · {t.period.replace("_", "-")}
                      {usage[t.id] ? ` · used by ${usage[t.id]} organisation${usage[t.id] === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.status === "draft" && <button className={small} onClick={() => setEditing({ id: t.id, draft: toDraft(t) })}>Edit</button>}
                    {t.status === "draft" && <button className={small} disabled={busy || !w.ok} onClick={() => setStatus(t, "published")}>Publish</button>}
                    {t.status === "published" && <button className={small} disabled={busy} onClick={() => newVersion(t)}>New version</button>}
                    {t.status === "published" && <button className={small} disabled={busy} onClick={() => setStatus(t, "draft")}>Unpublish</button>}
                    {t.status !== "archived" && <button className={small} disabled={busy} onClick={() => setStatus(t, "archived")}>Archive</button>}
                    {t.status === "archived" && <button className={small} disabled={busy} onClick={() => setStatus(t, "draft")}>Restore as draft</button>}
                    <button className={small} disabled={busy} onClick={() => call("platform_kpi_copy", { p_id: t.id, p_new_version: false }, "Duplicated as a draft")}>Duplicate</button>
                    <button className={small} onClick={() => exportJson(t)}>Export</button>
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="text-xs text-[#5f5f5d] cursor-pointer">Show KPIs</summary>
                  <table className="w-full text-xs mt-2">
                    <thead><tr className="text-left text-[#5f5f5d]"><th className="py-1">KPI</th><th>Source</th><th>Type</th><th>Better</th><th className="text-right">Weight</th></tr></thead>
                    <tbody>
                      {[...t.kpi_template_items].sort((a, b) => a.sort_order - b.sort_order).map(i => (
                        <tr key={i.sort_order} className="border-t border-[#ebece6]">
                          <td className="py-1">{i.name}</td>
                          <td>{!i.source_key ? "Manual evaluation" : SOURCE_BY_KEY.get(i.source_key)?.label ?? "Data source not configured"}</td>
                          <td>{i.measurement}</td><td>{i.direction}</td><td className="text-right">{i.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
