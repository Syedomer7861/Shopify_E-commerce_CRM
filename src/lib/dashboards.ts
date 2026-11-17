import type { SupabaseClient } from "@supabase/supabase-js";
import type { LayoutItem } from "@/components/workspace/WorkspaceHome";

export type Dashboard = {
  id: string; org_id: string | null; name: string; description: string; category: string;
  status: "draft" | "published" | "archived"; version: number; layout: LayoutItem[]; published_layout: LayoutItem[] | null;
  source_dashboard_id: string | null; created_by: string | null; updated_by: string | null; updated_at: string;
};
export type Assignment = { id: string; dashboard_id: string; target_type: TargetType; target_key: string };
export type TargetType = "role" | "branch" | "department" | "designation" | "employee";
export type Person = { id: string; name: string | null; role: string; is_active: boolean; branch_id: string | null; department_id: string | null; designation_id: string | null };
export type Named = { id: string; name: string };

export const TARGETS: { value: TargetType; label: string }[] = [
  { value: "role", label: "System role" },
  { value: "branch", label: "Branch" },
  { value: "department", label: "Department" },
  { value: "designation", label: "Designation" },
  { value: "employee", label: "Employee" },
];
/** Same order as my_dashboard() in the database: most specific first. */
const PRIORITY: TargetType[] = ["employee", "designation", "department", "branch", "role"];

export const DASH_COLS = "id, org_id, name, description, category, status, version, layout, published_layout, source_dashboard_id, created_by, updated_by, updated_at";

/** Which dashboard each person actually lands on (mirrors my_dashboard()). */
export function resolveFor(people: Person[], assignments: Assignment[], published: Set<string>): Map<string, string> {
  const key = (t: TargetType, k: string) => `${t}:${k}`;
  const map = new Map(assignments.filter(a => published.has(a.dashboard_id)).map(a => [key(a.target_type, a.target_key), a.dashboard_id]));
  const out = new Map<string, string>();
  for (const p of people.filter(x => x.is_active)) {
    const val: Record<TargetType, string | null> = { employee: p.id, designation: p.designation_id, department: p.department_id, branch: p.branch_id, role: p.role };
    for (const t of PRIORITY) {
      const d = val[t] ? map.get(key(t, val[t]!)) : undefined;
      if (d) { out.set(p.id, d); break; }
    }
  }
  return out;
}

export async function loadDirectory(sb: SupabaseClient) {
  const [d, a, roles, deps, des, brs, people] = await Promise.all([
    sb.from("dashboards").select(DASH_COLS).order("name"),
    sb.from("dashboard_assignments").select("id, dashboard_id, target_type, target_key"),
    sb.from("roles").select("name").order("name"),
    sb.from("departments").select("id, name").eq("is_active", true).order("name"),
    sb.from("designations").select("id, name").eq("is_active", true).order("name"),
    sb.from("branches").select("id, name").eq("is_active", true).order("name"),
    sb.from("profiles").select("id, name, role, is_active, branch_id, department_id, designation_id").eq("is_active", true).order("name"),
  ]);
  if (d.error) throw new Error(d.error.message);
  return {
    dashboards: (d.data ?? []) as Dashboard[],
    assignments: (a.data ?? []) as Assignment[],
    roles: Array.from(new Set(((roles.data ?? []) as { name: string }[]).map(r => r.name))),
    departments: (deps.data ?? []) as Named[], designations: (des.data ?? []) as Named[], branches: (brs.data ?? []) as Named[],
    people: (people.data ?? []) as Person[],
  };
}
export type Directory = Awaited<ReturnType<typeof loadDirectory>>;

/** Human label for an assignment target. */
export function targetLabel(dir: Directory, t: TargetType, k: string): string {
  const find = (l: Named[]) => l.find(x => x.id === k)?.name ?? "Removed";
  if (t === "role") return k.replace(/_/g, " ");
  if (t === "employee") return dir.people.find(p => p.id === k)?.name ?? "Former employee";
  return find(t === "branch" ? dir.branches : t === "department" ? dir.departments : dir.designations);
}

/** Layout sanity before saving: known widgets, valid sizes, at most 40. */
export function layoutProblems(items: LayoutItem[], known: Set<string>): string[] {
  const p: string[] = [];
  if (items.length > 40) p.push("At most 40 widgets");
  const bad = items.filter(i => !known.has(i.widget));
  if (bad.length) p.push(`${bad.length} widget(s) no longer exist; remove them`);
  if (items.some(i => (i.title ?? "").length > 80)) p.push("Widget titles are limited to 80 characters");
  return p;
}
