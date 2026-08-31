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
};

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
 * Marketing workspace gate. True for admins, the marketing role, managers,
 * or anyone explicitly granted the manage_marketing permission flag.
 */
export function canAccessMarketing(profile: Partial<Profile> | null | undefined) {
  return hasPermission(profile, "manage_marketing");
}
