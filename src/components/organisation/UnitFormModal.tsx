"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { SENIORITY, sameName, unitError, type AnyUnit, type CatalogEntry, type UnitTable } from "@/lib/org-structure";
import { UnitCombobox, type ComboOption } from "./UnitCombobox";

type Person = { id: string; name: string | null };
const NOUN: Record<UnitTable, string> = { branches: "branch", departments: "department", designations: "designation" };
const NONE = "__none__";

/**
 * Create or edit a branch, department or designation with all its fields.
 * Writes go through the caller's session, so RLS (admin or
 * organisation:manage, own org only) is what allows or refuses them.
 */
export function UnitFormModal({
  table, open, initial, units, people, catalog, onClose, onSaved,
}: {
  table: UnitTable;
  open: boolean;
  initial: Partial<AnyUnit> | null; // id present = edit
  units: Record<UnitTable, AnyUnit[]>;
  people: Person[];
  catalog: CatalogEntry[];
  onClose: () => void;
  onSaved: (unit: AnyUnit) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState<Partial<AnyUnit>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setF(initial ?? {}); setErr(null); } }, [open, initial]);

  const set = (k: keyof AnyUnit, v: string | null) => setF(prev => ({ ...prev, [k]: v === NONE || v === "" ? null : v }));
  const editing = Boolean(initial?.id);
  const noun = NOUN[table];

  const peopleOpts: ComboOption[] = people.map(p => ({ value: p.id, label: p.name || "Unnamed" }));
  const deptOpts: ComboOption[] = units.departments.filter(d => d.is_active && d.id !== f.id).map(d => ({ value: d.id, label: d.name, group: d.category ?? undefined }));
  const desigOpts: ComboOption[] = units.designations.filter(d => d.is_active && d.id !== f.id).map(d => ({ value: d.id, label: d.name }));
  const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));
  const branchTypes: ComboOption[] = uniq([...catalog.filter(c => c.kind === "branch_type").map(c => c.name), f.branch_type ?? ""]).map(n => ({ value: n, label: n }));
  const categories: ComboOption[] = uniq([...catalog.filter(c => c.kind === "department").map(c => c.category), f.category ?? ""]).map(n => ({ value: n, label: n }));
  const desigCategories: ComboOption[] = uniq([...catalog.filter(c => c.kind === "designation").map(c => c.category), f.category ?? ""]).map(n => ({ value: n, label: n }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = (f.name ?? "").trim();
    if (!name) return setErr("Name is required.");
    if (name.length > 120) return setErr("Name is too long (120 characters max).");
    const clash = units[table].find(u => u.id !== f.id && sameName(u.name, name));
    if (clash) return setErr(`"${clash.name}" already exists${clash.is_active ? "" : " (retired). Restore it instead"}.`);
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return setErr("Email looks wrong.");

    const fields: Record<UnitTable, (keyof AnyUnit)[]> = {
      branches: ["branch_type", "code", "address", "city", "phone", "email", "manager_id"],
      departments: ["category", "description", "head_id", "parent_id"],
      designations: ["category", "seniority", "description", "department_id", "reports_to_id"],
    };
    const row: Record<string, unknown> = { name };
    for (const k of fields[table]) row[k] = typeof f[k] === "string" ? (f[k] as string).trim() || null : f[k] ?? null;

    setBusy(true);
    const q = editing ? supabase.from(table).update(row).eq("id", f.id!) : supabase.from(table).insert(row);
    const { data, error } = await q.select("*").single();
    setBusy(false);
    if (error) return setErr(unitError(error, name));
    toast.success(editing ? "Saved" : `${name} added`);
    onSaved(data as AnyUnit);
  }

  const field = (label: string, child: React.ReactNode, htmlFor?: string) => (
    <div>
      <label htmlFor={htmlFor} className="text-xs font-medium text-[#3a3a36] block mb-1">{label}</label>
      {child}
    </div>
  );
  const text = (k: keyof AnyUnit, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    field(label, <input id={`unit-${k}`} className="input w-full text-xs" value={(f[k] as string) ?? ""} onChange={e => set(k, e.target.value)} {...props} />, `unit-${k}`);
  const combo = (k: keyof AnyUnit, label: string, options: ComboOption[], extra: { addLabel?: string; freeText?: boolean } = {}) =>
    field(label, (
      <UnitCombobox
        id={`unit-${k}`}
        value={(f[k] as string) ?? null}
        options={[{ value: NONE, label: "None" }, ...options]}
        onChange={v => set(k, v)}
        addLabel={extra.addLabel}
        onAdd={extra.freeText ? q => q && set(k, q) : undefined}
      />
    ), `unit-${k}`);

  return (
    <Modal open={open} onClose={onClose} title={`${editing ? "Edit" : "Add"} ${noun}`} maxWidth="max-w-lg"
      footer={<>
        <button type="button" onClick={onClose} className="btn-secondary text-xs px-4">Cancel</button>
        <button type="submit" form="unit-form" disabled={busy} className="btn-primary text-xs px-4">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editing ? "Save" : `Add ${noun}`}</button>
      </>}>
      <form id="unit-form" onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">{text("name", `${noun[0].toUpperCase()}${noun.slice(1)} name *`, { maxLength: 120, autoFocus: true, required: true })}</div>
        {table === "branches" && <>
          {combo("branch_type", "Branch type", branchTypes, { addLabel: "Use typed type", freeText: true })}
          {text("code", "Branch code", { maxLength: 30 })}
          <div className="sm:col-span-2">{text("address", "Address", { maxLength: 300 })}</div>
          {text("city", "City", { maxLength: 80 })}
          {text("phone", "Phone", { maxLength: 40, type: "tel" })}
          {text("email", "Email", { maxLength: 200, type: "email" })}
          {combo("manager_id", "Branch manager", peopleOpts)}
        </>}
        {table === "departments" && <>
          {combo("category", "Category", categories, { addLabel: "Use typed category", freeText: true })}
          {combo("head_id", "Department head", peopleOpts)}
          <div className="sm:col-span-2">{combo("parent_id", "Team under department (optional)", deptOpts)}</div>
          <div className="sm:col-span-2">{text("description", "Description", { maxLength: 1000 })}</div>
        </>}
        {table === "designations" && <>
          {combo("department_id", "Department", deptOpts)}
          {field("Seniority level", <Select value={f.seniority ?? NONE} onChange={v => set("seniority", v)} triggerClassName="text-xs" options={[{ value: NONE, label: "Not set" }, ...SENIORITY]} />)}
          {combo("category", "Category", desigCategories, { addLabel: "Use typed category", freeText: true })}
          {combo("reports_to_id", "Reports to (designation)", desigOpts)}
          <div className="sm:col-span-2">{text("description", "Job description (optional)", { maxLength: 2000 })}</div>
        </>}
        {err && <p role="alert" className="sm:col-span-2 text-xs text-rose-600">{err}</p>}
      </form>
    </Modal>
  );
}
