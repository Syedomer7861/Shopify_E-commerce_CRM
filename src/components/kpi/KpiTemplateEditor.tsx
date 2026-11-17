"use client";
import { Plus, Trash2, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { KPI_SOURCES, SOURCE_BY_KEY } from "@/lib/kpi/sources";
import { weightCheck, type Measurement } from "@/lib/kpi/score";

export type KpiItem = {
  name: string; description: string; source_key: string | null; measurement: Measurement; direction: "higher" | "lower";
  unit: string; default_target: number | null; weight: number; cap: number | null; threshold: number | null; missing_rule: "exclude" | "zero";
};
export type KpiTemplateDraft = {
  name: string; collection: string; description: string; department_hint: string; designation_hints: string[];
  industry: string; period: string; visibility: "public" | "hidden"; items: KpiItem[];
};

/** A template row as read from kpi_templates with its items embedded. */
export type TemplateRow = {
  name: string; collection: string; description: string; department_hint: string | null; designation_hints: string[];
  industry: string | null; period: string; visibility: "public" | "hidden"; kpi_template_items: (KpiItem & { sort_order: number })[];
};
export const toDraft = (t: TemplateRow): KpiTemplateDraft => ({
  name: t.name, collection: t.collection, description: t.description, department_hint: t.department_hint ?? "",
  designation_hints: t.designation_hints, industry: t.industry ?? "", period: t.period, visibility: t.visibility,
  items: [...t.kpi_template_items].sort((a, b) => a.sort_order - b.sort_order).map(({ sort_order: _s, ...i }) => i),
});
export const toPayload = (d: KpiTemplateDraft) => ({
  ...d, name: d.name.trim(), designation_hints: d.designation_hints.map(s => s.trim()).filter(Boolean),
  department_hint: d.department_hint.trim() || null, industry: d.industry.trim() || null,
  items: d.items.map(i => ({ ...i, name: i.name.trim() })),
});

export const MEASUREMENTS: Measurement[] = ["numeric", "percentage", "currency", "time", "rating", "boolean", "milestone"];
export const PERIODS = ["weekly", "monthly", "quarterly", "half_yearly", "yearly"];
const input = "h-9 px-2 bg-white border border-[#ebece6] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";
const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export const blankItem = (): KpiItem => ({
  name: "", description: "", source_key: null, measurement: "numeric", direction: "higher", unit: "",
  default_target: null, weight: 0, cap: null, threshold: null, missing_rule: "exclude",
});
export const blankDraft = (): KpiTemplateDraft => ({
  name: "", collection: "", description: "", department_hint: "", designation_hints: [], industry: "", period: "monthly", visibility: "public", items: [blankItem()],
});

/** What a draft needs before it can be saved; publishing also needs weights of 100. */
export function draftProblems(d: KpiTemplateDraft): string | null {
  if (!d.name.trim()) return "Add a template name";
  if (d.items.length === 0) return "Add at least one KPI";
  if (d.items.some(i => !i.name.trim())) return "Every KPI needs a name";
  if (weightCheck(d.items).invalid) return "Weights must be 0 to 100";
  return null;
}

/** `global`: the Super Admin library (adds visibility). Organisations get the same editor without it. */
export function KpiTemplateEditor({ value, onChange, global = false }: { value: KpiTemplateDraft; onChange: (d: KpiTemplateDraft) => void; global?: boolean }) {
  const set = (p: Partial<KpiTemplateDraft>) => onChange({ ...value, ...p });
  const setItem = (i: number, p: Partial<KpiItem>) => set({ items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });
  const move = (i: number) => { const a = [...value.items]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ items: a }); };
  const w = weightCheck(value.items);

  function pickSource(i: number, key: string) {
    const s = SOURCE_BY_KEY.get(key);
    if (!s) return setItem(i, { source_key: key || null });
    const it = value.items[i];
    setItem(i, { source_key: key, measurement: s.measurement, direction: s.direction, unit: s.unit, name: it.name.trim() ? it.name : s.label });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={input} maxLength={120} placeholder="Template name, e.g. Calling & Telecalling" value={value.name} onChange={e => set({ name: e.target.value })} />
        <input className={input} maxLength={120} placeholder="Collection" value={value.collection} onChange={e => set({ collection: e.target.value })} />
        <input className={input} maxLength={120} placeholder="Department it suits, e.g. Customer Support" value={value.department_hint} onChange={e => set({ department_hint: e.target.value })} />
        <input className={input} maxLength={120} placeholder="Industry (optional)" value={value.industry} onChange={e => set({ industry: e.target.value })} />
        <input className={cn(input, "sm:col-span-2")} placeholder="Designations it suits, comma separated" value={value.designation_hints.join(", ")}
          onChange={e => set({ designation_hints: e.target.value.split(",").map(s => s.trimStart()).filter((s, i, a) => s || i === a.length - 1) })} />
        <textarea className={cn(input, "sm:col-span-2 h-16 py-2")} maxLength={1000} placeholder="Description" value={value.description} onChange={e => set({ description: e.target.value })} />
        <select className={input} value={value.period} onChange={e => set({ period: e.target.value })}>
          {PERIODS.map(p => <option key={p} value={p}>{p.replace("_", "-")} review</option>)}
        </select>
        {global && (
          <select className={input} value={value.visibility} onChange={e => set({ visibility: e.target.value as KpiTemplateDraft["visibility"] })}>
            <option value="public">Visible to organisations once published</option>
            <option value="hidden">Hidden from organisations</option>
          </select>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-[#1c1c1c]">KPIs</div>
        <div className={cn("text-xs font-semibold", w.ok ? "text-[#2f8a5f]" : "text-amber-700")}>Weights total {w.total}{w.ok ? "" : " (must be 100 to publish)"}</div>
      </div>
      {value.items.map((it, i) => {
        const src = it.source_key ? SOURCE_BY_KEY.get(it.source_key) : null;
        return (
          <div key={i} className="border border-[#ebece6] rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <input className={cn(input, "flex-1 min-w-[180px]")} maxLength={120} placeholder="KPI name" value={it.name} onChange={e => setItem(i, { name: e.target.value })} />
              <select className={cn(input, "min-w-[200px]")} value={it.source_key ?? ""} onChange={e => pickSource(i, e.target.value)} aria-label="Data source">
                <option value="">Manual evaluation</option>
                {Array.from(new Set(KPI_SOURCES.map(s => s.group))).map(g => (
                  <optgroup key={g} label={g}>{KPI_SOURCES.filter(s => s.group === g).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>
                ))}
                {it.source_key && !src && <option value={it.source_key}>{it.source_key} (not configured)</option>}
              </select>
              <button onClick={() => i > 0 && move(i)} disabled={i === 0} aria-label="Move up" className="px-2 rounded-lg border border-[#ebece6] disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => set({ items: value.items.filter((_, j) => j !== i) })} aria-label="Remove KPI" className="px-2 rounded-lg border border-[#ebece6] text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] text-[#5f5f5d]">
              <label>Type<br /><select className={input} value={it.measurement} disabled={!!src} onChange={e => setItem(i, { measurement: e.target.value as Measurement })}>
                {MEASUREMENTS.map(m => <option key={m} value={m}>{m}</option>)}</select></label>
              <label>Better when<br /><select className={input} value={it.direction} disabled={!!src} onChange={e => setItem(i, { direction: e.target.value as KpiItem["direction"] })}>
                <option value="higher">Higher</option><option value="lower">Lower</option></select></label>
              <label>Unit<br /><input className={cn(input, "w-20")} value={it.unit} disabled={!!src} onChange={e => setItem(i, { unit: e.target.value })} /></label>
              <label>Default target<br /><input className={cn(input, "w-24")} inputMode="decimal" placeholder="Org sets" value={it.default_target ?? ""} onChange={e => setItem(i, { default_target: num(e.target.value) })} /></label>
              <label>Weight %<br /><input className={cn(input, "w-20")} inputMode="decimal" value={it.weight} onChange={e => setItem(i, { weight: num(e.target.value) ?? 0 })} /></label>
              <label>Cap %<br /><input className={cn(input, "w-20")} inputMode="decimal" placeholder="120" value={it.cap ?? ""} onChange={e => setItem(i, { cap: num(e.target.value) })} /></label>
              <label>Min % to score<br /><input className={cn(input, "w-20")} inputMode="decimal" placeholder="None" value={it.threshold ?? ""} onChange={e => setItem(i, { threshold: num(e.target.value) })} /></label>
              <label>No data<br /><select className={input} value={it.missing_rule} onChange={e => setItem(i, { missing_rule: e.target.value as KpiItem["missing_rule"] })}>
                <option value="exclude">Leave out</option><option value="zero">Count as 0</option></select></label>
            </div>
            {src?.note && <div className="text-[10px] text-[#5f5f5d]">{src.note}</div>}
          </div>
        );
      })}
      <button onClick={() => set({ items: [...value.items, blankItem()] })} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-[#ebece6]">
        <Plus className="w-3.5 h-3.5" /> Add KPI
      </button>
    </div>
  );
}
