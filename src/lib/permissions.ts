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

// Every module key the Main Menu can show. Order matches Sidebar's `nav`.
export const ALL_NAV_MODULES = [
  "dashboard", "tasks", "chat", "my-hub",
  "customers", "orders", "calendar", "performance", "request-creative",
] as const;

/**
 * The Main-Menu allowlist for a profile, or null when every module is visible.
 * A per-user `permissions.nav_modules` array always wins; otherwise a
 * Workspace-role user falls back to the locked-down default above; every other
 * role (and admins) is unrestricted.
 */
export function allowedNavModules(profile: Partial<Profile> | null | undefined): string[] | null {
  if (isAdmin(profile)) return null;
  const override = profile?.permissions?.nav_modules;
  if (Array.isArray(override)) return override;
  if (profile?.role === "marketing") return DEFAULT_MARKETING_PERMISSIONS.nav_modules ?? null;
  return null;
}

export function normalizePermissions(profile: Partial<Profile> | null | undefined): UserPermissions {
  if (profile?.role === "hr") return DEFAULT_HR_PERMISSIONS;
  if (profile?.role === "manager") return DEFAULT_MANAGER_PERMISSIONS;
  if (profile?.role === "marketing") return DEFAULT_MARKETING_PERMISSIONS;
  return {
    ...DEFAULT_PERMISSIONS,
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
