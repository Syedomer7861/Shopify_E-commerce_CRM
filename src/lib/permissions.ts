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
};

export function normalizePermissions(profile: Partial<Profile> | null | undefined): UserPermissions {
  if (profile?.role === "hr") return DEFAULT_HR_PERMISSIONS;
  if (profile?.role === "manager") return DEFAULT_MANAGER_PERMISSIONS;
  return {
    ...DEFAULT_PERMISSIONS,
    ...(profile?.permissions || {}),
  };
}

export function isAdmin(profile: Partial<Profile> | null | undefined) {
  return profile?.role === "admin";
}

export function hasPermission(profile: Partial<Profile> | null | undefined, permission: keyof UserPermissions) {
  return isAdmin(profile) || normalizePermissions(profile)[permission];
}
