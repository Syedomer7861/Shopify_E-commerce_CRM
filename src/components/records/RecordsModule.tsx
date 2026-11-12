"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Loader2, Download, Trash2, AlertTriangle, Pencil, Search } from "lucide-react";
import { Modal, EmptyState, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";
import type { Profile } from "@/types";
import { can } from "@/lib/access";

export type RecordRow = Record<string, any> & { id: string };
export type RecordField = {
  key: string; label: string; required?: boolean;
  /** "person" stores a team member's id and shows their name. */
  type?: "text" | "number" | "date" | "datetime-local" | "textarea" | "select" | "person";
  options?: string[];
};
export type RecordsConfig = {
  table: string;
  /** Permission-engine module key (src/lib/access.ts) that governs this table. */
  module: string;
  noun: string;
  ownerCol: string;
  ownerLabel?: string;
  columns: { key: string; label: string; format?: (value: any, row: RecordRow) => ReactNode }[];
  fields: RecordField[];
  /** When set, `status` is editable inline by anyone who can edit the row. */
  statuses?: string[];
  rowActions?: (row: RecordRow, reload: () => void) => ReactNode;
  /**
   * Example rows drawn while the table is still empty, so a new team can see
   * what the module is for. Never written to the database, never exported,
   * and gone as soon as the first real record exists.
   */
  samples?: Record<string, any>[];
  /** Rows are limited to these column values, and new rows are created with them (Apps: one module's records). */
  filter?: Record<string, string>;
  /** Field values live inside this JSON column instead of in columns of their own (Apps). */
  dataCol?: string;
  /** Overrides the permission-engine checks for tables it doesn't govern; row security still decides. */
  access?: { create: boolean; edit: (row: RecordRow) => boolean; delete: boolean; export: boolean };
  /** Lets someone who may edit a row change its fields, not only its status. Off for records another step decides (expense claims, invoices). */
  editable?: boolean;
  /** A second save button that runs something on the row just created (Field Visits: straight to check-in). */
  createAndAct?: { label: string; run: (row: RecordRow, reload: () => void) => void };
};

const label = (s: string) => s.replace(/_/g, " ");
export const money = (v: any) => (v === null || v === undefined || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);
export const day = (v: any) => (v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

/**
 * One list + create form + inline status for a permission-engine table.
 * Reads and writes go straight to Supabase under the signed-in user, so RLS
 * (can_reach / has_perm) decides what comes back and what is accepted; the
 * `can()` checks here only decide which buttons to draw.
 */
export function RecordsModule({ config, profile }: { config: RecordsConfig; profile: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { table, module, noun, ownerCol } = config;
  const { access, dataCol, filter } = config;
  const canCreate = access ? access.create : can(profile, module, "create") !== null;
  const canEditAny = can(profile, module, "edit") !== null;
  const canEditRow = (row: RecordRow) => (access ? access.edit(row) : canEditAny);
  const canDelete = access ? access.delete : can(profile, module, "delete") !== null;
  const canExport = access ? access.export : can(profile, module, "export") !== null;
  const filterKey = JSON.stringify(filter || {});
  const personKeys = useMemo(() => new Set(config.fields.filter(f => f.type === "person").map(f => f.key)), [config.fields]);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, team] = await Promise.all([
      supabase.from(table).select("*").match(JSON.parse(filterKey)).order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id,name"),
    ]);
    if (list.error) setNotReady(true);
    else {
      setNotReady(false);
      // Real columns win over a same-named key inside the JSON column.
      setRows((list.data as RecordRow[]).map(r => (dataCol ? { ...(r[dataCol] || {}), ...r } : r)));
    }
    setPeople(Object.fromEntries((team.data || []).map((p: any) => [p.id, p.name || "Unnamed"])));
    setLoading(false);
  }, [supabase, table, filterKey, dataCol]);

  useEffect(() => { load(); }, [load]);

  // The Requests page links here with ?new=1 so the form is already open.
  useEffect(() => {
    if (canCreate && new URLSearchParams(window.location.search).get("new") === "1") setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  async function create(thenAct = false) {
    const missing = config.fields.find(f => f.required && !form[f.key]?.trim());
    if (missing) return toast.error(`${missing.label} is required`);
    setSaving(true);
    // The id is made here rather than read back: INSERT ... RETURNING can be refused by the SELECT policy even when the insert is allowed.
    const values: Record<string, any> = {};
    for (const f of config.fields) {
      const v = form[f.key]?.trim();
      if (v) values[f.key] = f.type === "number" ? Number(v) : v;
      else if (editing) values[f.key] = null; // a cleared field must overwrite the old value
    }
    if (editing) {
      // Fields the definition no longer lists stay in the JSON untouched.
      const change = dataCol ? { [dataCol]: { ...(editing[dataCol] || {}), ...values } } : values;
      const { error } = await supabase.from(table).update(change).eq("id", editing.id);
      if (error) toast.error(error.message);
      else { toast.success("Saved"); closeForm(); load(); }
      setSaving(false);
      return;
    }
    const payload: Record<string, any> = { id: crypto.randomUUID(), [ownerCol]: profile.id, ...(filter || {}), ...(dataCol ? { [dataCol]: values } : values) };
    const { error } = await supabase.from(table).insert(payload);
    if (error) toast.error(error.code === "23505" ? `That ${noun} already exists` : error.message);
    else {
      toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} added`); closeForm(); load();
      if (thenAct) config.createAndAct?.run({ ...payload, id: payload.id as string }, load);
    }
    setSaving(false);
  }

  function closeForm() { setOpen(false); setEditing(null); setForm({}); }

  function openEdit(row: RecordRow) {
    const next: Record<string, string> = {};
    for (const f of config.fields) {
      const v = row[f.key];
      if (v === null || v === undefined) continue;
      next[f.key] = f.type === "date" ? String(v).slice(0, 10) : f.type === "datetime-local" ? String(v).slice(0, 16) : String(v);
    }
    setForm(next); setEditing(row); setOpen(true);
  }

  async function setStatus(row: RecordRow, status: string) {
    const { error } = await supabase.from(table).update({ status }).eq("id", row.id);
    if (error) toast.error(error.message);
    else setRows(prev => prev.map(r => r.id === row.id ? { ...r, status } : r));
  }

  async function remove(row: RecordRow) {
    if (!confirm(`Delete this ${noun}? This cannot be undone.`)) return;
    const { error } = await supabase.from(table).delete().eq("id", row.id);
    if (error) toast.error(error.message);
    else setRows(prev => prev.filter(r => r.id !== row.id));
  }

  function exportCsv() {
    const keys = [...config.columns.map(c => c.key), "status", ownerCol, "created_at"].filter((k, i, a) => a.indexOf(k) === i);
    const cell = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [keys.join(","), ...rows.map(r => keys.map(k => cell(k === ownerCol || personKeys.has(k) ? people[r[k]] ?? r[k] : r[k])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${table}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const isSample = rows.length === 0 && !!config.samples?.length;
  const all: RecordRow[] = isSample ? config.samples!.map((s, i) => ({ ...s, id: "sample-" + i })) : rows;
  const statusCounts = all.reduce<Record<string, number>>((acc, r) => { const s = r.status || "—"; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  const needle = query.trim().toLowerCase();
  const shown = all.filter(r =>
    (!statusFilter || (r.status || "—") === statusFilter) &&
    (!needle || [...config.columns.map(c => (personKeys.has(c.key) ? people[r[c.key]] : r[c.key])), people[r[ownerCol]], r.status]
      .some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(needle))));

  if (loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (notReady) {
    return (
      <div className="card p-5 flex items-start gap-3 text-sm text-amber-700 bg-amber-50 border-amber-100">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>This module isn&apos;t set up on this database yet. Run <code>supabase/APPLY_PHASES_1_TO_7.sql</code> in the SQL Editor, then reload.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
        {all.length > 0 && (
          <div className="relative flex-1 min-w-[160px] max-w-xs mr-auto">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input type="search" aria-label={`Search ${noun}s`} placeholder="Search" className="input pl-8 text-xs" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        )}
        {canExport && rows.length > 0 && (
          <button onClick={exportCsv} className="btn-secondary flex items-center gap-1.5 text-xs"><Download className="w-3.5 h-3.5" /> Export</button>
        )}
        {canCreate && (
          <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" /> New {noun}</button>
        )}
      </div>

      {isSample && (
        <div className="mb-3 rounded-lg border border-dashed border-[#d9d5ca] bg-[#f7f4ed] px-3 py-2 text-[11px] text-[#5f5f5d]">
          <span className="font-bold text-[#1c1c1c]">Sample data.</span> These rows are examples to show how this module works. They are not saved{canCreate ? " and disappear when you add your first " + noun + "." : "."}
        </div>
      )}

      {Object.keys(statusCounts).length > 1 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
          {[[null, all.length] as const, ...Object.entries(statusCounts)].map(([s, n]) => (
            <button key={s ?? "all"} onClick={() => setStatusFilter(s)} aria-pressed={statusFilter === s}
              className={"px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border " + (statusFilter === s ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-gray-600 border-[#eceae4]")}>
              {s === null ? "All" : label(s)} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
      )}

      {all.length > 0 && shown.length === 0 ? (
        <EmptyState icon={<Search className="w-6 h-6" />} title="No matches" desc="Try a different search or status." />
      ) : shown.length === 0 ? (
        <EmptyState icon={<Plus className="w-6 h-6" />} title={`No ${noun}s yet`} desc={canCreate ? `Add the first one with "New ${noun}".` : "Nothing you have access to here."} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 border-b border-gray-100">
                {config.columns.map(c => <th key={c.key} className="p-3">{c.label}</th>)}
                <th className="p-3">Status</th>
                <th className="p-3">{config.ownerLabel || "Owner"}</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map(row => (
                <tr key={row.id} className={"border-b border-gray-50 last:border-0" + (isSample ? " opacity-70" : "")}>
                  {config.columns.map(c => (
                    <td key={c.key} className="p-3 text-[#1c1c1c]">{c.format ? c.format(row[c.key], row) : personKeys.has(c.key) ? (people[row[c.key]] || "—") : (row[c.key] ?? "—")}</td>
                  ))}
                  <td className="p-2 min-w-[130px]">
                    {config.statuses && !isSample && canEditRow(row) ? (
                      <Select value={row.status} onChange={v => setStatus(row, v)} triggerClassName="text-xs capitalize"
                        options={config.statuses.map(s => ({ value: s, label: label(s) }))} />
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-600">{label(row.status || "—")}</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-500">{isSample ? "Sample" : people[row[ownerCol]] || "—"}</td>
                  <td className="p-3 text-right whitespace-nowrap sticky right-0 bg-[#f7f4ed]">
                    {!isSample && config.rowActions?.(row, load)}
                    {config.editable && !isSample && canEditRow(row) && (
                      <button onClick={() => openEdit(row)} aria-label={`Edit ${noun}`} className="text-gray-400 hover:text-[#1c1c1c] ml-2 align-middle"><Pencil className="w-3.5 h-3.5" /></button>
                    )}
                    {canDelete && !isSample && (
                      <button onClick={() => remove(row)} aria-label={`Delete ${noun}`} className="text-gray-300 hover:text-rose-500 ml-2 align-middle"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={closeForm} title={editing ? `Edit ${noun}` : `New ${noun}`}
        footer={
          <div className="flex flex-col gap-2 w-full">
            {config.createAndAct && !editing && (
              <button onClick={() => create(true)} disabled={saving} className="btn-primary w-full py-2.5">{saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : config.createAndAct.label}</button>
            )}
            <button onClick={() => create()} disabled={saving} className={(config.createAndAct && !editing ? "btn-secondary" : "btn-primary") + " w-full py-2.5"}>{saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : editing ? "Save changes" : config.createAndAct ? `Save ${noun} for later` : `Save ${noun}`}</button>
          </div>
        }>
        <div className="space-y-3">
          {config.fields.map(f => {
            const id = `${table}-${f.key}`;
            const set = (v: string) => setForm(prev => ({ ...prev, [f.key]: v }));
            return (
              <div key={f.key}>
                <label htmlFor={id} className="text-xs font-medium text-gray-700 block mb-1">{f.label}{f.required && " *"}</label>
                {f.type === "person" ? (
                  <Select value={form[f.key] || ""} onChange={set} placeholder="Choose a person" options={Object.entries(people).map(([value, name]) => ({ value, label: name }))} />
                ) : f.type === "select" ? (
                  <Select value={form[f.key] || ""} onChange={set} placeholder="Choose" options={(f.options || []).map(o => ({ value: o, label: label(o) }))} />
                ) : f.type === "textarea" ? (
                  <textarea id={id} className="input min-h-[72px]" value={form[f.key] || ""} onChange={e => set(e.target.value)} />
                ) : (
                  <input id={id} type={f.type || "text"} className="input min-w-0 max-w-full appearance-none" value={form[f.key] || ""} onChange={e => set(e.target.value)} min={f.type === "number" ? 0 : undefined} step={f.type === "number" ? "0.01" : undefined} />
                )}
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

/** Page shell shared by the module pages: profile gate + tab strip. */
export function ModuleTabs<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string }[]; active: T; onChange: (k: T) => void }) {
  if (tabs.length < 2) return null;
  return (
    <div className="flex gap-1 mb-5 border-b border-[#eceae4] overflow-x-auto scrollbar-hide">
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={`px-3 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors whitespace-nowrap ${active === t.key ? "border-[#1c1c1c] text-[#1c1c1c]" : "border-transparent text-gray-400 hover:text-[#1c1c1c]"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
