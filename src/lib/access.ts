import type { Profile } from "@/types";

/**
 * Permission engine, client/server half. A role's `grants` (roles.grants in
 * the DB) says, per module and action, how far the holder reaches. The SQL
 * half - perm_scope() / can_reach() in 20261111c - enforces the same data in
 * RLS, so this file only decides what to show and which API calls to allow;
 * it is never the last line of defence.
 */
export const SCOPES = ["own", "assigned", "team", "department", "branch", "organisation"] as const;
export type Scope = (typeof SCOPES)[number];

export const ACTIONS = ["view", "create", "edit", "delete", "approve", "export", "assign", "manage"] as const;
export type Action = (typeof ACTIONS)[number];

export type Grants = Record<string, Partial<Record<Action, Scope>>>;

export const SCOPE_LABELS: Record<Scope, string> = {
  own: "Own", assigned: "Assigned", team: "Team", department: "Department", branch: "Branch", organisation: "Everyone",
};

/** Every module the matrix editor offers, and the actions that mean something for it. */
export const PERMISSION_MODULES: { key: string; label: string; group: string; actions: readonly Action[] }[] = [
  { key: "customers", label: "Customers", group: "Sales & CRM", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "orders", label: "Orders", group: "Sales & CRM", actions: ["view", "edit", "delete", "export"] },
  { key: "leads", label: "Leads", group: "Sales & CRM", actions: ["view", "create", "edit", "delete", "assign"] },
  { key: "deals", label: "Deals", group: "Sales & CRM", actions: ["view", "create", "edit", "delete", "assign"] },
  { key: "visits", label: "Field Visits", group: "Sales & CRM", actions: ["view", "create", "edit"] },
  { key: "work", label: "Tasks & Projects", group: "Work", actions: ["view", "create", "edit", "delete", "approve", "assign", "manage"] },
  { key: "approvals", label: "Approvals", group: "Work", actions: ["view", "approve"] },
  { key: "tickets", label: "Service Desk", group: "Work", actions: ["view", "create", "edit", "assign", "manage"] },
  { key: "workflows", label: "Workflows", group: "Work", actions: ["view", "manage"] },
  { key: "expenses", label: "Expenses", group: "Finance", actions: ["view", "create", "approve", "export"] },
  { key: "vendors", label: "Vendors", group: "Finance", actions: ["view", "create", "edit", "delete"] },
  { key: "invoices", label: "Invoices", group: "Finance", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "reports", label: "Reports", group: "Administration", actions: ["view", "export"] },
  { key: "team", label: "Team", group: "Administration", actions: ["view", "manage"] },
  { key: "organisation", label: "Organisation", group: "Administration", actions: ["view", "manage"] },
  { key: "audit", label: "Audit Log", group: "Administration", actions: ["view", "export"] },
];

type WithGrants = Partial<Profile> & { role_grants?: Grants; org_disabled_modules?: string[]; org_platform_blocked_modules?: string[] };

/** Off for the whole org: switched off by its admin, or not available to it (plan or platform owner). */
export function orgModuleOff(profile: Pick<WithGrants, "org_disabled_modules" | "org_platform_blocked_modules"> | null | undefined, module: string) {
  return !!(profile?.org_disabled_modules?.includes(module) || profile?.org_platform_blocked_modules?.includes(module));
}

/** True when the platform owner has turned this feature flag on for the profile's org. */
export function hasFlag(profile: Partial<Profile> | null | undefined, key: string) {
  return !!profile?.org_feature_flags?.includes(key);
}

/**
 * The profile's scope for module.action, or null when not granted. Admins
 * reach everything. Before 20261111c is applied `role_grants` is undefined
 * and non-admins get null - new modules stay closed rather than open.
 */
export function can(profile: WithGrants | null | undefined, module: string, action: Action): Scope | null {
  if (!profile || profile.is_active === false) return null;
  if (orgModuleOff(profile, module)) return null; // off for the whole org, admins included
  if (profile.role === "admin") return "organisation";
  const scope = profile.role_grants?.[module]?.[action];
  return scope && SCOPES.includes(scope) ? scope : null;
}

/** True when `scope` is at least as wide as `min` (own < assigned < team < department < branch < organisation). */
export function scopeAtLeast(scope: Scope | null, min: Scope) {
  return scope !== null && SCOPES.indexOf(scope) >= SCOPES.indexOf(min);
}
