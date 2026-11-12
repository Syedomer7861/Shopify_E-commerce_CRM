import type { Profile, UserPermissions } from "@/types";

export const DEFAULT_PERMISSIONS: UserPermissions = {
  view_analytics: false,
  can_import: false,
  can_delete: false,
  manage_team: false,
  manage_orders: true,
  manage_customers: true,
  send_whatsapp: true,
  audit_tasks: false,
  manage_automations: false,
  manage_marketing: false,
  manage_workspaces: false,
};

export const DEFAULT_HR_PERMISSIONS: UserPermissions = {
  view_analytics: true,
  can_import: false,
  can_delete: false,
  manage_team: false,
  manage_orders: true,
  manage_customers: true,
  send_whatsapp: true,
  audit_tasks: false,
  manage_automations: false,
  manage_marketing: false,
  manage_workspaces: false,
};

export const DEFAULT_MANAGER_PERMISSIONS: UserPermissions = {
  view_analytics: true,
  can_import: true,
  can_delete: false,
  manage_team: true,
  manage_orders: true,
  manage_customers: true,
  send_whatsapp: true,
  audit_tasks: true,
  manage_automations: true,
  manage_marketing: true,
  manage_workspaces: true,
};

// Marketing department: full access to the marketing workspace, plus the
// customer-facing basics it needs for segment-targeted campaigns. No team,
// order, or import powers.
export const DEFAULT_MARKETING_PERMISSIONS: UserPermissions = {
  view_analytics: true,
  can_import: false,
  can_delete: false,
  manage_team: false,
  manage_orders: false,
  manage_customers: true,
  send_whatsapp: true,
  audit_tasks: false,
  manage_automations: false,
  manage_marketing: true,
  manage_workspaces: false,
  // A Workspace user is scoped to the workspace by default: no CRM main-menu
  // modules. An admin can widen this per user in Team → Edit → Module Access.
  nav_modules: ["my-hub", "chat", "request-creative"],
};

// Every gate-able page, grouped for the admin UI. Keys are the first URL
// segment (so ModuleGuard can match without a lookup table); "request-creative"
// is the one exception — it lives under /workspace/request and is never
// redirected, it only appears here as an allowlist entry.
export const NAV_MODULE_GROUPS: Record<string, readonly string[]> = {
  "Main Menu": [
    "dashboard", "tasks", "chat", "my-hub",
    "customers", "orders", "calendar", "performance", "request-creative",
  ],
  "Operations": [
    "floor", "reports", "abandoned-carts", "admin-logs", "recordings",
    "import", "campaigns", "templates", "workflows", "system-health", "settings",
  ],
  "Management": ["team", "roles", "organisation", "hr", "manager"],
};

export const ALL_NAV_MODULES = Object.values(NAV_MODULE_GROUPS).flat();

/**
 * The pages that only make sense for a business selling to consumers and
 * working a call queue. An organisation that isn't one (an agency, a clinic,
 * a school, a services firm) turns the whole suite off with one switch on the
 * Organisation page: the key below goes into organizations.disabled_modules
 * and these pages close for everyone, admins included. Data is untouched.
 */
export const COMMERCE_SUITE = "commerce";
export const COMMERCE_NAV: readonly string[] = [
  "tasks", "customers", "orders", "reports", "abandoned-carts",
  "recordings", "import", "campaigns", "templates", "manager",
];

/** Main menu a brand-new custom role starts with: nothing industry-specific. */
export const NEUTRAL_NAV_MODULES: readonly string[] = ["dashboard", "my-hub", "chat", "calendar"];

/**
 * The Main-Menu allowlist for a profile, or null when every module is visible.
 * A per-user `permissions.nav_modules` array always wins; otherwise a
 * Workspace-role user falls back to the locked-down default above; every other
 * role (and admins) is unrestricted.
 */
export function allowedNavModules(profile: Partial<Profile> | null | undefined): string[] | null {
  const base = roleNavModules(profile);
  if (!profile?.org_disabled_modules?.includes(COMMERCE_SUITE)) return base;
  return (base ?? ALL_NAV_MODULES).filter(key => !COMMERCE_NAV.includes(key));
}

function roleNavModules(profile: Partial<Profile> | null | undefined): string[] | null {
  if (isAdmin(profile)) return null;
  const override = profile?.permissions?.nav_modules;
  if (Array.isArray(override)) return override;
  // useCurrentProfile resolves this from the org's `roles` table - the live,
  // admin-editable allowlist for `profile.role`, including any custom
  // designation an admin defined on the Roles page. Falls through to the
  // hardcoded default below only when that lookup hasn't run.
  if (profile?.role_nav_modules !== undefined) return profile.role_nav_modules;
  if (profile?.role === "marketing") return DEFAULT_MARKETING_PERMISSIONS.nav_modules ?? null;
  return null;
}

// Role default is the FLOOR, not the final word: a per-user `permissions`
// object saved on the profile is merged on top, so an admin's checkbox in
// Team → Edit actually sticks for hr/manager/marketing users too (it used
// to be silently ignored — the role default was returned verbatim).
export function normalizePermissions(profile: Partial<Profile> | null | undefined): UserPermissions {
  // Same precedence as allowedNavModules: the role's live DB definition
  // (useCurrentProfile) beats the hardcoded 5-role switch, which only
  // applies when that lookup hasn't run - e.g. a hand-built lightweight
  // profile, or a brand-new role row that failed to resolve.
  const base =
    profile?.role_permissions ??
    (profile?.role === "hr" ? DEFAULT_HR_PERMISSIONS :
    profile?.role === "manager" ? DEFAULT_MANAGER_PERMISSIONS :
    profile?.role === "marketing" ? DEFAULT_MARKETING_PERMISSIONS :
    DEFAULT_PERMISSIONS);
  return {
    ...base,
    ...(profile?.permissions || {}),
  };
}

export function isAdmin(profile: Partial<Profile> | null | undefined) {
  return profile?.role === "admin";
}

export function hasPermission(profile: Partial<Profile> | null | undefined, permission: keyof UserPermissions) {
  return isAdmin(profile) || Boolean(normalizePermissions(profile)[permission]);
}

/**
 * Blanket workspace privilege — can create/administer Spaces regardless of
 * membership. True for admins, managers, and the manage_workspaces (or legacy
 * manage_marketing) flag. Per-Space visibility for everyone else is enforced
 * by membership, server-side (see can_access_space() in the DB).
 */
export function isWorkspaceAdmin(profile: Partial<Profile> | null | undefined) {
  return hasPermission(profile, "manage_workspaces") || hasPermission(profile, "manage_marketing");
}

/** @deprecated use isWorkspaceAdmin — kept so existing imports don't break. */
export const canAccessMarketing = isWorkspaceAdmin;
