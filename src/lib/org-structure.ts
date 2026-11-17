import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Organisation structure engine: shared types and loaders. The starter lists
 * (departments, designations, branch types, industry templates) live in the
 * database (org_unit_catalog / org_structure_templates), not here. The value
 * lists below mirror CHECK constraints on the tables, so they stay in code.
 */

export type UnitTable = "branches" | "departments" | "designations";

export type Branch = {
  id: string; name: string; is_active: boolean; is_head_office?: boolean;
  branch_type?: string | null; code?: string | null; address?: string | null; city?: string | null;
  phone?: string | null; email?: string | null; manager_id?: string | null;
};
export type Department = {
  id: string; name: string; is_active: boolean;
  category?: string | null; description?: string | null; head_id?: string | null; parent_id?: string | null;
};
export type Designation = {
  id: string; name: string; is_active: boolean;
  category?: string | null; seniority?: string | null; description?: string | null;
  department_id?: string | null; reports_to_id?: string | null;
};
export type AnyUnit = Branch & Department & Designation;

export type CatalogEntry = { id: string; kind: "department" | "designation" | "branch_type"; name: string; category: string; seniority: string | null; department_hint: string | null };
export type StructureTemplate = { code: string; name: string; departments: string[]; designations: string[] };

export const SENIORITY = [
  { value: "executive", label: "Executive leadership" },
  { value: "senior_leadership", label: "Senior leadership" },
  { value: "management", label: "Management" },
  { value: "senior", label: "Senior" },
  { value: "mid", label: "Mid level" },
  { value: "junior", label: "Junior" },
  { value: "entry", label: "Entry level" },
];
export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" }, { value: "part_time", label: "Part-time" }, { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" }, { value: "consultant", label: "Consultant" }, { value: "temporary", label: "Temporary" },
];
export const WORK_ARRANGEMENTS = [
  { value: "onsite", label: "On-site" }, { value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" },
];
export const EMPLOYMENT_STATUSES = [
  { value: "active", label: "Active" }, { value: "probation", label: "Probation" }, { value: "notice_period", label: "Notice period" },
  { value: "on_leave", label: "On leave" }, { value: "suspended", label: "Suspended" }, { value: "exited", label: "Exited" },
];

export const UNIT_SELECT: Record<UnitTable, string> = {
  branches: "id,name,is_active,is_head_office,branch_type,code,address,city,phone,email,manager_id",
  departments: "id,name,is_active,category,description,head_id,parent_id",
  designations: "id,name,is_active,category,seniority,description,department_id,reports_to_id",
};
// Before migration 20261117b the extra columns don't exist; fall back so the page keeps working.
const LEGACY_SELECT: Record<UnitTable, string> = {
  branches: "id,name,is_active,is_head_office", departments: "id,name,is_active", designations: "id,name,is_active",
};

/** Loads one org's units (RLS scopes to the caller's org). `engine` is false until the migration is applied. */
export async function loadUnits(supabase: SupabaseClient, table: UnitTable): Promise<{ rows: AnyUnit[]; engine: boolean; error: boolean }> {
  const full = await supabase.from(table).select(UNIT_SELECT[table]).order("name");
  if (!full.error) return { rows: (full.data ?? []) as unknown as AnyUnit[], engine: true, error: false };
  const legacy = await supabase.from(table).select(LEGACY_SELECT[table]).order("name");
  return { rows: (legacy.data ?? []) as unknown as AnyUnit[], engine: false, error: Boolean(legacy.error) };
}

export async function loadCatalog(supabase: SupabaseClient): Promise<CatalogEntry[]> {
  const { data } = await supabase.from("org_unit_catalog").select("id,kind,name,category,seniority,department_hint").order("sort_order");
  return (data ?? []) as CatalogEntry[];
}

export async function loadTemplates(supabase: SupabaseClient): Promise<StructureTemplate[]> {
  const { data } = await supabase.from("org_structure_templates").select("code,name,departments,designations").order("sort_order");
  return (data ?? []) as StructureTemplate[];
}

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Friendly message for the duplicate-name unique index. */
export const unitError = (e: { code?: string; message: string }, name: string) =>
  e.code === "23505" ? `"${name}" already exists. Restore or pick the existing one instead.` : e.message;
