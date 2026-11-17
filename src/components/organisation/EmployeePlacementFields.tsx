"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, WORK_ARRANGEMENTS, loadCatalog, loadUnits, type AnyUnit, type CatalogEntry, type UnitTable } from "@/lib/org-structure";
import { UnitCombobox, type ComboOption } from "./UnitCombobox";
import { UnitFormModal } from "./UnitFormModal";

export type Placement = {
  branch_id: string | null; department_id: string | null; designation_id: string | null; manager_id: string | null;
  employment_type: string | null; work_arrangement: string | null; employee_grade: string | null; employment_status: string | null;
};
export const EMPTY_PLACEMENT: Placement = {
  branch_id: null, department_id: null, designation_id: null, manager_id: null,
  employment_type: null, work_arrangement: null, employee_grade: null, employment_status: null,
};
export const placementFrom = (p: Partial<Placement> | null | undefined): Placement => ({ ...EMPTY_PLACEMENT, ...Object.fromEntries(Object.keys(EMPTY_PLACEMENT).map(k => [k, (p as Record<string, string | null> | undefined)?.[k] ?? null])) } as Placement);

type Person = { id: string; name: string | null; is_active?: boolean };
const NONE = "__none__";

/**
 * Branch, department, designation, manager and employment fields for the
 * employee form, all from the organisation's own records (stable ids, not
 * free text). `onChange` also hands back the legacy text copies
 * (department / designation names) older HR screens still read.
 */
export function EmployeePlacementFields({ value, onChange, selfId, people }: {
  value: Placement;
  onChange: (next: Placement, legacy: { department?: string; designation?: string }, engine: boolean) => void;
  selfId?: string;
  people: Person[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [units, setUnits] = useState<Record<UnitTable, AnyUnit[]>>({ branches: [], departments: [], designations: [] });
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [engine, setEngine] = useState(false);
  const [adding, setAdding] = useState<{ table: UnitTable; name: string } | null>(null);

  const load = useCallback(async () => {
    const [b, d, g, c] = await Promise.all([loadUnits(supabase, "branches"), loadUnits(supabase, "departments"), loadUnits(supabase, "designations"), loadCatalog(supabase)]);
    setUnits({ branches: b.rows, departments: d.rows, designations: g.rows });
    setCatalog(c);
    setEngine(b.engine && d.engine && g.engine);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const emit = (next: Placement, all = units) => {
    const dept = all.departments.find(x => x.id === next.department_id)?.name;
    const desig = all.designations.find(x => x.id === next.designation_id)?.name;
    onChange(engine ? next : { ...next, employment_type: null, work_arrangement: null, employee_grade: null, employment_status: null },
      { ...(dept ? { department: dept } : {}), ...(desig ? { designation: desig } : {}) }, engine);
  };
  const set = (k: keyof Placement, v: string | null) => emit({ ...value, [k]: v === NONE || v === "" ? null : v });

  // Active records, plus the current one even if retired so it still shows.
  const opts = (list: AnyUnit[], current: string | null): ComboOption[] =>
    list.filter(u => u.is_active || u.id === current).map(u => ({ value: u.id, label: u.is_active ? u.name : `${u.name} (retired)`, group: u.category ?? undefined }));

  // Designations of the chosen department first, then ones whose catalog
  // category fits the department's category, then the rest.
  const desigOpts = useMemo((): ComboOption[] => {
    const dept = units.departments.find(d => d.id === value.department_id);
    const hint = (name: string) => catalog.find(c => c.kind === "designation" && c.name.toLowerCase() === name.toLowerCase())?.department_hint;
    const all = units.designations.filter(u => u.is_active || u.id === value.designation_id);
    if (!dept) return all.map(u => ({ value: u.id, label: u.name }));
    const fits = (u: AnyUnit) => u.department_id === dept.id || (!u.department_id && dept.category && hint(u.name) === dept.category);
    return [
      ...all.filter(fits).map(u => ({ value: u.id, label: u.name, group: `Suggested for ${dept.name}` })),
      ...all.filter(u => !fits(u)).map(u => ({ value: u.id, label: u.name, group: "All designations" })),
    ];
  }, [units, catalog, value.department_id, value.designation_id]);

  // Stable object so the form isn't reset while the user types.
  const addInitial = useMemo(() => adding
    ? { name: adding.name, ...(adding.table === "designations" && value.department_id ? { department_id: value.department_id } : {}) }
    : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [adding]);

  const managers: ComboOption[] = people.filter(p => p.id !== selfId && p.is_active !== false).map(p => ({ value: p.id, label: p.name || "Unnamed" }));
  const label = (t: string) => <label className="text-[9px] font-bold text-[#9a9a94] uppercase tracking-wider block mb-1">{t}</label>;
  const combo = (k: keyof Placement, t: string, options: ComboOption[], addTable?: UnitTable) => (
    <div>
      {label(t)}
      <UnitCombobox
        value={value[k]}
        options={[{ value: NONE, label: "None" }, ...options]}
        onChange={v => set(k, v)}
        addLabel={addTable ? `Add custom ${t.toLowerCase()}` : undefined}
        onAdd={addTable ? q => setAdding({ table: addTable, name: q }) : undefined}
      />
    </div>
  );
  const pick = (k: keyof Placement, t: string, list: { value: string; label: string }[]) => (
    <div>
      {label(t)}
      <Select value={value[k] ?? NONE} onChange={v => set(k, v)} triggerClassName="text-xs" options={[{ value: NONE, label: "Not set" }, ...list]} />
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {combo("branch_id", "Branch", opts(units.branches, value.branch_id), "branches")}
      {combo("department_id", "Department", opts(units.departments, value.department_id), "departments")}
      {combo("designation_id", "Designation", desigOpts, "designations")}
      {combo("manager_id", "Reporting manager", managers)}
      {engine && <>
        {pick("employment_type", "Employment type", EMPLOYMENT_TYPES)}
        {pick("work_arrangement", "Work arrangement", WORK_ARRANGEMENTS)}
        <div>
          {label("Employee grade")}
          <input className="input w-full text-xs" maxLength={40} placeholder="e.g. L2, G5" value={value.employee_grade ?? ""} onChange={e => set("employee_grade", e.target.value)} />
        </div>
        {pick("employment_status", "Employment status", EMPLOYMENT_STATUSES)}
      </>}
      <UnitFormModal
        table={adding?.table ?? "designations"}
        open={Boolean(adding)}
        initial={addInitial}
        units={units}
        people={people.map(p => ({ id: p.id, name: p.name }))}
        catalog={catalog}
        onClose={() => setAdding(null)}
        onSaved={saved => {
          const t = adding!.table;
          const next = { ...units, [t]: [...units[t], saved] };
          setUnits(next);
          setAdding(null);
          const field = t === "branches" ? "branch_id" : t === "departments" ? "department_id" : "designation_id";
          emit({ ...value, [field]: saved.id }, next);
        }}
      />
    </div>
  );
}
