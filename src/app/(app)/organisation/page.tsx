"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Network, BadgeCheck, Users, Plus, Loader2, AlertTriangle, Pencil, Trash2, Check, X, LayoutTemplate } from "lucide-react";
import { PageHeader, AccessDenied, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { can } from "@/lib/access";
import { SWITCHABLE_MODULES } from "@/lib/modules";
import { loadCatalog, loadTemplates, loadUnits, sameName, SENIORITY, unitError, type AnyUnit, type CatalogEntry, type StructureTemplate, type UnitTable } from "@/lib/org-structure";
import { UnitCombobox, type ComboOption } from "@/components/organisation/UnitCombobox";
import { UnitFormModal } from "@/components/organisation/UnitFormModal";
import { TemplatePicker } from "@/components/organisation/TemplatePicker";

type Unit = AnyUnit;
type Member = {
  id: string; name: string | null; role: string; is_active: boolean;
  branch_id: string | null; department_id: string | null; designation_id: string | null; manager_id: string | null;
};
type PlacementField = "branch_id" | "department_id" | "designation_id" | "manager_id";

const SECTIONS: { table: UnitTable; title: string; icon: typeof Building2; hint: string }[] = [
  { table: "branches", title: "Branches", icon: Building2, hint: "Offices, stores or warehouses." },
  { table: "departments", title: "Departments", icon: Network, hint: "Sales, Finance, Marketing..." },
  { table: "designations", title: "Designations", icon: BadgeCheck, hint: "Job titles used across the org." },
];

const NONE = "__none__";

export default function OrganisationPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [units, setUnits] = useState<Record<UnitTable, Unit[]>>({ branches: [], departments: [], designations: [] });
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);
  const [draft, setDraft] = useState<Record<UnitTable, string>>({ branches: "", departments: "", designations: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [modulesOff, setModulesOff] = useState<string[] | null>(null);
  const [timeoutMin, setTimeoutMin] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  // Structure engine (migration 20261117b). false = old free-text add only.
  const [engine, setEngine] = useState(false);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [templates, setTemplates] = useState<StructureTemplate[]>([]);
  const [form, setForm] = useState<{ table: UnitTable; initial: Partial<Unit> } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const canView = hasPermission(profile, "manage_team") || can(profile, "organisation", "view") !== null;
  const canEdit = can(profile, "organisation", "manage") !== null; // branches, departments, designations
  const canPlace = isAdmin(profile); // profile rows are admin-writable only

  const load = useCallback(async () => {
    setLoading(true);
    const [b, d, g, p, cat, tpl] = await Promise.all([
      loadUnits(supabase, "branches"),
      loadUnits(supabase, "departments"),
      loadUnits(supabase, "designations"),
      supabase.from("profiles").select("id,name,role,is_active,branch_id,department_id,designation_id,manager_id").order("name"),
      loadCatalog(supabase),
      loadTemplates(supabase),
    ]);
    // Tables arrive with supabase/APPLY_PHASE1.sql; until then show a notice instead of erroring.
    if (b.error || d.error || g.error || p.error) {
      setNotReady(true);
    } else {
      setNotReady(false);
      setUnits({ branches: b.rows, departments: d.rows, designations: g.rows });
      setMembers(p.data as Member[]);
      setEngine(b.engine && d.engine && g.engine && cat.length > 0);
      setCatalog(cat);
      setTemplates(tpl);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (!profileLoading && canView) load(); }, [profileLoading, canView, load]);
  // /organisation?templates=1 (from the Organisation dashboard) opens the industry template picker.
  useEffect(() => {
    if (engine && canEdit && new URLSearchParams(window.location.search).get("templates") === "1") setShowTemplates(true);
  }, [engine, canEdit]);

  // Org-wide controls (20261111g). Undefined on the profile = that migration isn't applied, so the card is hidden.
  const controlsReady = profile?.org_disabled_modules !== undefined;
  const off = modulesOff ?? profile?.org_disabled_modules ?? [];
  const timeoutValue = timeoutMin ?? (profile?.org_session_timeout_minutes ? String(profile.org_session_timeout_minutes) : "");

  async function saveControls() {
    const minutes = timeoutValue.trim() ? Number(timeoutValue) : null;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440)) return toast.error("Timeout must be 5 to 1440 minutes, or blank for none");
    setBusy("controls");
    const { error } = await supabase.rpc("set_org_controls", { modules_off: off, timeout_minutes: minutes });
    if (error) toast.error(error.message);
    else toast.success("Saved. Members see the change on their next page load.");
    setBusy(null);
  }

  async function addUnit(table: UnitTable) {
    const name = draft[table].trim();
    if (!name) return;
    setBusy(table);
    const { error } = await supabase.from(table).insert({ name });
    if (error) toast.error(error.code === "23505" ? `"${name}" already exists` : error.message);
    else { setDraft(prev => ({ ...prev, [table]: "" })); await load(); }
    setBusy(null);
  }

  async function toggleUnit(table: UnitTable, unit: Unit) {
    const count = peopleIn(table, unit.id);
    if (unit.is_active && !window.confirm(`Retire "${unit.name}"?${count ? ` ${count} ${count === 1 ? "person keeps" : "people keep"} it until moved, but it can't be picked for anyone new.` : ""} You can restore it later.`)) return;
    setBusy(unit.id);
    const { error } = await supabase.from(table).update({ is_active: !unit.is_active }).eq("id", unit.id);
    if (error) toast.error(error.message);
    else setUnits(prev => ({ ...prev, [table]: prev[table].map(u => u.id === unit.id ? { ...u, is_active: !u.is_active } : u) }));
    setBusy(null);
  }

  /** Pick a starter entry: departments / designations are added directly, a branch type opens the full form. */
  async function addFromCatalog(table: UnitTable, entry: CatalogEntry) {
    if (table === "branches") return setForm({ table, initial: { branch_type: entry.name, name: entry.name } });
    const existing = units[table].find(u => sameName(u.name, entry.name));
    if (existing) return toast.error(`"${existing.name}" already exists${existing.is_active ? "" : " (retired). Restore it instead"}.`);
    setBusy(table);
    const row = table === "departments" ? { name: entry.name, category: entry.category } : { name: entry.name, category: entry.category, seniority: entry.seniority };
    const { error } = await supabase.from(table).insert(row);
    if (error) toast.error(unitError(error, entry.name));
    else { toast.success(`${entry.name} added`); await load(); }
    setBusy(null);
  }

  const catalogOptions = (table: UnitTable): ComboOption[] => {
    const kind = table === "branches" ? "branch_type" : table === "departments" ? "department" : "designation";
    return catalog.filter(c => c.kind === kind).map(c => {
      const added = table !== "branches" && units[table].some(u => sameName(u.name, c.name));
      return { value: c.id, label: c.name, group: c.category || undefined, hint: added ? "Added" : undefined, disabled: added };
    });
  };

  const rowMeta = (table: UnitTable, u: Unit) => {
    const person = (id?: string | null) => members.find(m => m.id === id)?.name;
    const bits = table === "branches" ? [u.branch_type, u.code, u.city, person(u.manager_id) && `Mgr: ${person(u.manager_id)}`]
      : table === "departments" ? [u.category, person(u.head_id) && `Head: ${person(u.head_id)}`]
      : [SENIORITY.find(x => x.value === u.seniority)?.label, units.departments.find(d => d.id === u.department_id)?.name];
    return bits.filter(Boolean).join(" · ");
  };

  // Teams (departments with a parent) sit right under their parent.
  const ordered = (table: UnitTable): { u: Unit; depth: number }[] => {
    const list = units[table];
    if (table !== "departments") return list.map(u => ({ u, depth: 0 }));
    const ids = new Set(list.map(u => u.id));
    const roots = list.filter(u => !u.parent_id || !ids.has(u.parent_id));
    return roots.flatMap(r => [{ u: r, depth: 0 }, ...list.filter(c => c.parent_id === r.id).map(c => ({ u: c, depth: 1 }))]);
  };

  const fieldOf = (table: UnitTable) => (table === "branches" ? "branch_id" : table === "departments" ? "department_id" : "designation_id");
  const peopleIn = (table: UnitTable, id: string) => members.filter(m => m[fieldOf(table)] === id).length;

  async function renameUnit(table: UnitTable, unit: Unit) {
    const name = editName.trim();
    if (!name || name === unit.name) { setEditing(null); return; }
    setBusy(unit.id);
    const { error } = await supabase.from(table).update({ name }).eq("id", unit.id);
    if (error) toast.error(error.code === "23505" ? `"${name}" already exists` : error.message);
    else {
      // HR screens still read the free-text copy on profiles; keep it in step (admins only can write profiles).
      if (canPlace && table !== "branches") {
        const col = table === "departments" ? "department" : "designation";
        await supabase.from("profiles").update({ [col]: name }).eq(fieldOf(table), unit.id);
      }
      setUnits(prev => ({ ...prev, [table]: prev[table].map(u => u.id === unit.id ? { ...u, name } : u) }));
      setEditing(null);
      toast.success("Renamed");
    }
    setBusy(null);
  }

  async function deleteUnit(table: UnitTable, unit: Unit) {
    const count = peopleIn(table, unit.id);
    if (count > 0) return toast.error(`${count} ${count === 1 ? "person is" : "people are"} in "${unit.name}". Move them first, or use Retire.`);
    if (!window.confirm(`Delete "${unit.name}"? This cannot be undone.`)) return;
    setBusy(unit.id);
    const { error } = await supabase.from(table).delete().eq("id", unit.id);
    if (error) toast.error(error.message);
    else { setUnits(prev => ({ ...prev, [table]: prev[table].filter(u => u.id !== unit.id) })); toast.success("Deleted"); }
    setBusy(null);
  }

  async function place(member: Member, field: PlacementField, raw: string) {
    const value = raw === NONE ? null : raw;
    // Keep the legacy free-text columns in step - the HR screens still read them.
    const patch: Record<string, string | null> = { [field]: value };
    if (field === "department_id") patch.department = units.departments.find(u => u.id === value)?.name ?? null;
    if (field === "designation_id") patch.designation = units.designations.find(u => u.id === value)?.name ?? null;
    setBusy(member.id);
    const { error } = await supabase.from("profiles").update(patch).eq("id", member.id);
    if (error) toast.error(error.message);
    else setMembers(prev => prev.map(m => m.id === member.id ? { ...m, [field]: value } : m));
    setBusy(null);
  }

  if (profileLoading) return <div className="py-12 text-center text-[#9a9a94]">Loading...</div>;
  if (!canView) return <AccessDenied title="Organisation setup" desc="Only team managers and HR can view the organisation structure." />;

  const opts = (list: Unit[]) => [
    { value: NONE, label: "—" },
    ...list.filter(u => u.is_active).map(u => ({ value: u.id, label: u.name })),
  ];
  const activeMembers = members.filter(m => m.is_active);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Organisation"
        subtitle="Branches, departments, designations and who reports to whom. Team and department visibility is built on this."
      />

      {loading ? (
        <div className="py-12 text-center text-[#9a9a94]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : notReady ? (
        <div className="card p-5 flex items-start gap-3 text-sm text-amber-700 bg-amber-50 border-amber-100">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>Organisation structure isn&apos;t set up on this database yet. Run <code>supabase/APPLY_PHASES_1_TO_7.sql</code> in the SQL Editor, then reload.</div>
        </div>
      ) : (
        <>
          {canEdit && engine && templates.length > 0 && (
            <div className="flex justify-end mb-3">
              <button onClick={() => setShowTemplates(true)} className="btn-secondary text-xs px-3 flex items-center gap-1.5">
                <LayoutTemplate className="w-3.5 h-3.5" /> Start from industry template
              </button>
            </div>
          )}
          <UnitFormModal
            table={form?.table ?? "departments"}
            open={Boolean(form)}
            initial={form?.initial ?? null}
            units={units}
            people={members.filter(m => m.is_active)}
            catalog={catalog}
            onClose={() => setForm(null)}
            onSaved={async saved => {
              const t = form?.table;
              const before = form?.initial;
              setForm(null);
              // HR screens still read the free-text copy on profiles; keep it in step on rename.
              if (t && t !== "branches" && canPlace && before?.id && before.name !== saved.name) {
                await supabase.from("profiles").update({ [t === "departments" ? "department" : "designation"]: saved.name }).eq(fieldOf(t), saved.id);
              }
              load();
            }}
          />
          <TemplatePicker
            open={showTemplates}
            onClose={() => setShowTemplates(false)}
            templates={templates}
            departments={units.departments}
            designations={units.designations}
            onDone={() => { setShowTemplates(false); load(); }}
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            {SECTIONS.map(({ table, title, icon: Icon, hint }) => (
              <div key={table} className="card p-4">
                <h2 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><Icon className="w-4 h-4" /> {title}</h2>
                <p className="text-[11px] text-[#9a9a94] mb-3">{hint}</p>
                <div className="space-y-1.5 mb-3">
                  {units[table].length === 0 && <div className="text-xs text-[#9a9a94] py-2">None yet.</div>}
                  {ordered(table).map(({ u, depth }) => editing === u.id ? (
                    <form key={u.id} onSubmit={e => { e.preventDefault(); renameUnit(table, u); }} className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Escape") setEditing(null); }}
                        maxLength={120}
                        aria-label={`Rename ${u.name}`}
                        className="input flex-1 text-xs py-1.5"
                      />
                      <button type="submit" disabled={busy === u.id || !editName.trim()} className="p-1.5 rounded-md bg-[#1c1c1c] text-white" aria-label="Save name">
                        {busy === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="p-1.5 rounded-md text-[#6b6b67] hover:bg-[#f0f0ec]" aria-label="Cancel rename">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div key={u.id} className={cn("flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-lg bg-[#f6f7f2]", depth > 0 && "ml-4")}>
                      <span className="min-w-0">
                        <span className={cn("block truncate", !u.is_active && "line-through text-[#9a9a94]")}>
                          {depth > 0 ? "↳ " : ""}{u.name}{u.is_head_office && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-[#3fa877]">HQ</span>}
                        </span>
                        {engine && rowMeta(table, u) && <span className="block truncate text-[10px] text-[#9a9a94]">{rowMeta(table, u)}</span>}
                      </span>
                      <span className="shrink-0 flex items-center gap-2">
                        <span className="text-[#9a9a94]" title="People assigned">{peopleIn(table, u.id)}</span>
                        {canEdit && (
                          <>
                            <button onClick={() => { if (engine) setForm({ table, initial: u }); else { setEditing(u.id); setEditName(u.name); } }} disabled={busy === u.id} className="text-[#9a9a94] hover:text-[#1c1c1c]" aria-label={`Rename ${u.name}`} title="Rename">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => toggleUnit(table, u)} disabled={busy === u.id} className="text-[10px] text-[#6b6b67] hover:text-[#1c1c1c] underline">
                              {u.is_active ? "Retire" : "Restore"}
                            </button>
                            {!u.is_head_office && (
                              <button onClick={() => deleteUnit(table, u)} disabled={busy === u.id} className="text-[#9a9a94] hover:text-red-600" aria-label={`Delete ${u.name}`} title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {canEdit && engine && (
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <UnitCombobox
                        value={null}
                        options={catalogOptions(table)}
                        placeholder={table === "branches" ? "Pick a branch type" : `Search or select ${title.toLowerCase().replace(/e?s$/, "")}`}
                        onChange={id => { const c = catalog.find(x => x.id === id); if (c) addFromCatalog(table, c); }}
                        addLabel={`Add custom ${title.toLowerCase().replace(/e?s$/, "")}`}
                        onAdd={q => setForm({ table, initial: { name: q } })}
                        disabled={busy === table}
                      />
                    </div>
                    <button type="button" onClick={() => setForm({ table, initial: {} })} className="btn-primary px-2.5 text-xs" aria-label={`Add custom ${title}`} title="Add custom">
                      {busy === table ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
                {canEdit && !engine && (
                  <form onSubmit={e => { e.preventDefault(); addUnit(table); }} className="flex gap-2">
                    <input
                      value={draft[table]}
                      onChange={e => setDraft(prev => ({ ...prev, [table]: e.target.value }))}
                      placeholder={`Add ${title.toLowerCase().replace(/e?s$/, "")}`}
                      maxLength={120}
                      aria-label={`New ${title}`}
                      className="input flex-1 text-xs"
                    />
                    <button type="submit" disabled={busy === table || !draft[table].trim()} className="btn-primary px-2.5 text-xs" aria-label={`Add ${title}`}>
                      {busy === table ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>

          {canPlace && controlsReady && (
            <div className="card p-4 mb-8">
              <h2 className="text-sm font-bold text-[#1c1c1c]">Modules &amp; security</h2>
              <p className="text-[11px] text-[#9a9a94] mb-3">Switch a module off for the whole organisation - it closes for everyone, admins included, and its data is kept. <span className="font-bold text-[#6b6b67]">Sales &amp; call centre</span> covers the call queue, customers, orders, carts, campaigns, recordings and sales analytics: switch it off if your organisation doesn&apos;t sell to consumers.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {SWITCHABLE_MODULES.map(m => profile?.org_platform_blocked_modules?.includes(m.key) ? (
                  <div key={m.key} className="flex items-center gap-2 p-2.5 rounded-lg border border-[#ebece6] bg-[#f6f7f2] text-[11px] text-[#6b6b67]" title="Not included in your plan. Contact us to add it.">
                    <input type="checkbox" checked={false} disabled aria-label={`${m.label}: not in your plan`} />
                    {m.label} <span className="ml-auto text-[9px] uppercase tracking-wider">Not in plan</span>
                  </div>
                ) : (
                  <label key={m.key} className="flex items-center gap-2 p-2.5 rounded-lg border border-[#ebece6] text-[11px] text-[#1c1c1c] cursor-pointer">
                    <input type="checkbox" checked={!off.includes(m.key)} onChange={() => setModulesOff(off.includes(m.key) ? off.filter(k => k !== m.key) : [...off, m.key])} />
                    {m.label}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="session-timeout" className="text-xs font-medium text-[#3a3a36] block mb-1">Sign out after idle (minutes)</label>
                  <input id="session-timeout" type="number" min={5} max={1440} placeholder="Never" className="input w-40 text-xs" value={timeoutValue} onChange={e => setTimeoutMin(e.target.value)} />
                </div>
                <button onClick={saveControls} disabled={busy === "controls"} className="btn-primary text-xs px-4">
                  {busy === "controls" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save controls"}
                </button>
              </div>
            </div>
          )}

          <h2 className="text-sm font-bold text-[#1c1c1c] mb-1 flex items-center gap-2"><Users className="w-4 h-4" /> People &amp; reporting lines</h2>
          <p className="text-[11px] text-[#9a9a94] mb-4">
            {canPlace ? "Set where each person sits and who they report to." : "Read-only - an admin sets placements."}
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#9a9a94] border-b border-[#ebece6]">
                  <th className="p-3">Person</th><th className="p-3">Branch</th><th className="p-3">Department</th>
                  <th className="p-3">Designation</th><th className="p-3">Reports to</th>
                </tr>
              </thead>
              <tbody>
                {activeMembers.map(m => (
                  <tr key={m.id} className="border-b border-[#f6f7f2] last:border-0">
                    <td className="p-3">
                      <div className="font-semibold text-[#1c1c1c]">{m.name || "Unnamed"}</div>
                      <div className="text-[10px] text-[#9a9a94]">{m.role}</div>
                    </td>
                    {([
                      ["branch_id", opts(units.branches)],
                      ["department_id", opts(units.departments)],
                      ["designation_id", opts(units.designations)],
                      ["manager_id", [{ value: NONE, label: "—" }, ...activeMembers.filter(o => o.id !== m.id).map(o => ({ value: o.id, label: o.name || "Unnamed" }))]],
                    ] as [PlacementField, { value: string; label: string }[]][]).map(([field, options]) => (
                      <td key={field} className="p-2 min-w-[150px]">
                        <Select
                          value={m[field] ?? NONE}
                          onChange={v => place(m, field, v)}
                          disabled={!canPlace || busy === m.id}
                          triggerClassName="text-xs"
                          options={options}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
