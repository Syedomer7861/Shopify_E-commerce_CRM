"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Loader2, Download, Trash2, AlertTriangle } from "lucide-react";
import { Modal, EmptyState, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";
import type { Profile } from "@/types";
import { can } from "@/lib/access";

export type RecordRow = Record<string, any> & { id: string };
export type RecordField = {
  key: string; label: string; required?: boolean;
  type?: "text" | "number" | "date" | "datetime-local" | "textarea" | "select";
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

  const { table, module, noun, ownerCol } = config;
  const canCreate = can(profile, module, "create") !== null;
  const canEdit = can(profile, module, "edit") !== null;
  const canDelete = can(profile, module, "delete") !== null;
  const canExport = can(profile, module, "export") !== null;

  const load = useCallback(async () => {
    setLoading(true);
    const [list, team] = await Promise.all([
      supabase.from(table).select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id,name"),
    ]);
    if (list.error) setNotReady(true);
    else { setNotReady(false); setRows(list.data as RecordRow[]); }
    setPeople(Object.fromEntries((team.data || []).map((p: any) => [p.id, p.name || "Unnamed"])));
    setLoading(false);
  }, [supabase, table]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    const missing = config.fields.find(f => f.required && !form[f.key]?.trim());
    if (missing) return toast.error(`${missing.label} is required`);
    setSaving(true);
    const payload: Record<string, any> = { [ownerCol]: profile.id };
    for (const f of config.fields) {
      const v = form[f.key]?.trim();
      if (v) payload[f.key] = f.type === "number" ? Number(v) : v;
    }
    const { error } = await supabase.from(table).insert(payload);
    if (error) toast.error(error.code === "23505" ? `That ${noun} already exists` : error.message);
    else { toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} added`); setOpen(false); setForm({}); load(); }
    setSaving(false);
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
    const csv = [keys.join(","), ...rows.map(r => keys.map(k => cell(k === ownerCol ? people[r[k]] ?? r[k] : r[k])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${table}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

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
        {canExport && rows.length > 0 && (
          <button onClick={exportCsv} className="btn-secondary flex items-center gap-1.5 text-xs"><Download className="w-3.5 h-3.5" /> Export</button>
        )}
        {canCreate && (
          <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" /> New {noun}</button>
        )}
      </div>

      {rows.length === 0 ? (
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
              {rows.map(row => (
                <tr key={row.id} className="border-b border-gray-50 last:border-0">
                  {config.columns.map(c => (
                    <td key={c.key} className="p-3 text-[#1c1c1c]">{c.format ? c.format(row[c.key], row) : (row[c.key] ?? "—")}</td>
                  ))}
                  <td className="p-2 min-w-[130px]">
                    {config.statuses && canEdit ? (
                      <Select value={row.status} onChange={v => setStatus(row, v)} triggerClassName="text-xs capitalize"
                        options={config.statuses.map(s => ({ value: s, label: label(s) }))} />
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-600">{label(row.status || "—")}</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-500">{people[row[ownerCol]] || "—"}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {config.rowActions?.(row, load)}
                    {canDelete && (
                      <button onClick={() => remove(row)} aria-label={`Delete ${noun}`} className="text-gray-300 hover:text-rose-500 ml-2 align-middle"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={`New ${noun}`}
        footer={<button onClick={create} disabled={saving} className="btn-primary w-full py-2.5">{saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Save ${noun}`}</button>}>
        <div className="space-y-3">
          {config.fields.map(f => {
            const id = `${table}-${f.key}`;
            const set = (v: string) => setForm(prev => ({ ...prev, [f.key]: v }));
            return (
              <div key={f.key}>
                <label htmlFor={id} className="text-xs font-medium text-gray-700 block mb-1">{f.label}{f.required && " *"}</label>
                {f.type === "select" ? (
                  <Select value={form[f.key] || ""} onChange={set} placeholder="Choose" options={(f.options || []).map(o => ({ value: o, label: label(o) }))} />
                ) : f.type === "textarea" ? (
                  <textarea id={id} className="input min-h-[72px]" value={form[f.key] || ""} onChange={e => set(e.target.value)} />
                ) : (
                  <input id={id} type={f.type || "text"} className="input" value={form[f.key] || ""} onChange={e => set(e.target.value)} min={f.type === "number" ? 0 : undefined} step={f.type === "number" ? "0.01" : undefined} />
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
