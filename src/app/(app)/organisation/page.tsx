"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Network, BadgeCheck, Users, Plus, Loader2, AlertTriangle } from "lucide-react";
import { PageHeader, AccessDenied, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { can } from "@/lib/access";
import { SWITCHABLE_MODULES } from "@/lib/modules";

type Unit = { id: string; name: string; is_active: boolean; is_head_office?: boolean };
type Member = {
  id: string; name: string | null; role: string; is_active: boolean;
  branch_id: string | null; department_id: string | null; designation_id: string | null; manager_id: string | null;
};
type UnitTable = "branches" | "departments" | "designations";
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

  const canView = hasPermission(profile, "manage_team") || can(profile, "organisation", "view") !== null;
  const canEdit = can(profile, "organisation", "manage") !== null; // branches, departments, designations
  const canPlace = isAdmin(profile); // profile rows are admin-writable only

  const load = useCallback(async () => {
    setLoading(true);
    const [b, d, g, p] = await Promise.all([
      supabase.from("branches").select("id,name,is_active,is_head_office").order("name"),
      supabase.from("departments").select("id,name,is_active").order("name"),
      supabase.from("designations").select("id,name,is_active").order("name"),
      supabase.from("profiles").select("id,name,role,is_active,branch_id,department_id,designation_id,manager_id").order("name"),
    ]);
    // Tables arrive with supabase/APPLY_PHASE1.sql; until then show a notice instead of erroring.
    if (b.error || d.error || g.error || p.error) {
      setNotReady(true);
    } else {
      setNotReady(false);
      setUnits({ branches: b.data as Unit[], departments: d.data as Unit[], designations: g.data as Unit[] });
      setMembers(p.data as Member[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (!profileLoading && canView) load(); }, [profileLoading, canView, load]);

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
    setBusy(unit.id);
    const { error } = await supabase.from(table).update({ is_active: !unit.is_active }).eq("id", unit.id);
    if (error) toast.error(error.message);
    else setUnits(prev => ({ ...prev, [table]: prev[table].map(u => u.id === unit.id ? { ...u, is_active: !u.is_active } : u) }));
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

  if (profileLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
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
        <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : notReady ? (
        <div className="card p-5 flex items-start gap-3 text-sm text-amber-700 bg-amber-50 border-amber-100">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>Organisation structure isn&apos;t set up on this database yet. Run <code>supabase/APPLY_PHASES_1_TO_7.sql</code> in the SQL Editor, then reload.</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            {SECTIONS.map(({ table, title, icon: Icon, hint }) => (
              <div key={table} className="card p-4">
                <h2 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><Icon className="w-4 h-4" /> {title}</h2>
                <p className="text-[11px] text-gray-400 mb-3">{hint}</p>
                <div className="space-y-1.5 mb-3">
                  {units[table].length === 0 && <div className="text-xs text-gray-400 py-2">None yet.</div>}
                  {units[table].map(u => (
                    <div key={u.id} className="flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-lg bg-gray-50">
                      <span className={cn("truncate", !u.is_active && "line-through text-gray-400")}>
                        {u.name}{u.is_head_office && <span className="ml-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600">HQ</span>}
                      </span>
                      <span className="shrink-0 flex items-center gap-2">
                        <span className="text-gray-400">
                          {members.filter(m => m[table === "branches" ? "branch_id" : table === "departments" ? "department_id" : "designation_id"] === u.id).length}
                        </span>
                        {canEdit && (
                          <button onClick={() => toggleUnit(table, u)} disabled={busy === u.id} className="text-[10px] text-gray-500 hover:text-[#1c1c1c] underline">
                            {u.is_active ? "Retire" : "Restore"}
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {canEdit && (
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
              <p className="text-[11px] text-gray-400 mb-3">Switch a module off for the whole organisation - it closes for everyone, admins included, and its data is kept. <span className="font-bold text-gray-500">Sales &amp; call centre</span> covers the call queue, customers, orders, carts, campaigns, recordings and sales analytics: switch it off if your organisation doesn&apos;t sell to consumers.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {SWITCHABLE_MODULES.map(m => profile?.org_platform_blocked_modules?.includes(m.key) ? (
                  <div key={m.key} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50 text-[11px] text-gray-500" title="Not included in your plan. Contact us to add it.">
                    <input type="checkbox" checked={false} disabled aria-label={`${m.label}: not in your plan`} />
                    {m.label} <span className="ml-auto text-[9px] uppercase tracking-wider">Not in plan</span>
                  </div>
                ) : (
                  <label key={m.key} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 text-[11px] text-[#1c1c1c] cursor-pointer">
                    <input type="checkbox" checked={!off.includes(m.key)} onChange={() => setModulesOff(off.includes(m.key) ? off.filter(k => k !== m.key) : [...off, m.key])} />
                    {m.label}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="session-timeout" className="text-xs font-medium text-gray-700 block mb-1">Sign out after idle (minutes)</label>
                  <input id="session-timeout" type="number" min={5} max={1440} placeholder="Never" className="input w-40 text-xs" value={timeoutValue} onChange={e => setTimeoutMin(e.target.value)} />
                </div>
                <button onClick={saveControls} disabled={busy === "controls"} className="btn-primary text-xs px-4">
                  {busy === "controls" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save controls"}
                </button>
              </div>
            </div>
          )}

          <h2 className="text-sm font-bold text-[#1c1c1c] mb-1 flex items-center gap-2"><Users className="w-4 h-4" /> People &amp; reporting lines</h2>
          <p className="text-[11px] text-gray-400 mb-4">
            {canPlace ? "Set where each person sits and who they report to." : "Read-only - an admin sets placements."}
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 border-b border-gray-100">
                  <th className="p-3">Person</th><th className="p-3">Branch</th><th className="p-3">Department</th>
                  <th className="p-3">Designation</th><th className="p-3">Reports to</th>
                </tr>
              </thead>
              <tbody>
                {activeMembers.map(m => (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0">
                    <td className="p-3">
                      <div className="font-semibold text-[#1c1c1c]">{m.name || "Unnamed"}</div>
                      <div className="text-[10px] text-gray-400">{m.role}</div>
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
