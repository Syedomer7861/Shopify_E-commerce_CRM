import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data for the organisation dashboard. Every number is a real count; when a
 * source is missing or refused the field is null and the UI says so instead
 * of showing a zero.
 */
export type Group = { dim: string; key: string | null; n: number };
export type Summary = {
  total: number; active: number; with_manager: number; with_department: number;
  joined_30d: number; joined_prev_30d: number; with_joining_date: number; groups: Group[];
};
export type Unit = { id: string; name: string; is_active: boolean; parent_id?: string | null; head_id?: string | null; manager_id?: string | null; department_id?: string | null; city?: string | null; is_head_office?: boolean };
export type AuditRow = { id: string; actor_email: string | null; actor_id: string | null; entity_type: string; action: string; summary: string | null; created_at: string };
export type OrgOverview = {
  org: { name: string; plan: string | null; is_active: boolean; created_at: string } | null;
  summary: Summary | null;
  departments: Unit[]; designations: Unit[]; branches: Unit[];
  names: Record<string, string>;
  counts: { customRoles: number | null; holidays: number | null; policies: number | null; kpiPlans: number | null; onLeave: number | null; announcements: number | null };
  activity: AuditRow[] | null;
};

/** Audit entity types that describe the organisation itself (not sales or tasks). */
export const ORG_ENTITIES = ["profiles", "profile", "departments", "designations", "branches", "roles", "settings", "organizations", "holidays", "hr_policies", "kpi_plans", "kpi_assignments", "kpi_templates"];

const today = () => new Date().toISOString().slice(0, 10);
const headCount = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count, error } = await q;
  return error ? null : count ?? 0;
};

export async function loadOrgOverview(sb: SupabaseClient): Promise<OrgOverview> {
  const units = (t: string, cols: string) => sb.from(t).select(cols).order("name");
  const [org, summary, departments, designations, branches, customRoles, holidays, policies, kpiPlans, onLeave, announcements, activity] = await Promise.all([
    sb.from("organizations").select("name, plan, is_active, created_at").maybeSingle(),
    sb.rpc("org_workforce_summary"),
    units("departments", "id, name, is_active, parent_id, head_id"),
    units("designations", "id, name, is_active, department_id"),
    units("branches", "id, name, is_active, is_head_office, city, manager_id"),
    headCount(sb.from("roles").select("id", { count: "exact", head: true }).eq("is_system", false)),
    headCount(sb.from("holidays").select("id", { count: "exact", head: true })),
    headCount(sb.from("hr_policies").select("id", { count: "exact", head: true })),
    headCount(sb.from("kpi_plans").select("id", { count: "exact", head: true }).eq("status", "active")),
    headCount(sb.from("leaves").select("id", { count: "exact", head: true }).eq("status", "approved").lte("start_date", today()).gte("end_date", today())),
    headCount(sb.from("announcements").select("id", { count: "exact", head: true })),
    sb.from("audit_logs").select("id, actor_email, actor_id, entity_type, action, summary, created_at").in("entity_type", ORG_ENTITIES).order("created_at", { ascending: false }).limit(12),
  ]);
  const deps = (departments.data ?? []) as unknown as Unit[];
  const brs = (branches.data ?? []) as unknown as Unit[];
  const acts = activity.error ? null : (activity.data as AuditRow[]);
  // Names for department heads, branch managers and activity actors only.
  const ids = Array.from(new Set([...deps.map(d => d.head_id), ...brs.map(b => b.manager_id), ...(acts ?? []).map(a => a.actor_id)].filter((x): x is string => !!x)));
  const people = ids.length ? await sb.from("profiles").select("id, name").in("id", ids) : { data: [] };
  return {
    org: org.data ?? null,
    summary: summary.error ? null : (summary.data as Summary),
    departments: deps, designations: (designations.data ?? []) as unknown as Unit[], branches: brs,
    names: Object.fromEntries(((people.data ?? []) as { id: string; name: string | null }[]).map(p => [p.id, p.name ?? "—"])),
    counts: { customRoles, holidays, policies, kpiPlans, onLeave, announcements },
    activity: acts,
  };
}

/** Count for one dimension value from the summary groups (active employees). */
export const groupCounts = (s: Summary | null, dim: string) =>
  new Map((s?.groups ?? []).filter(g => g.dim === dim).map(g => [g.key, g.n]));
