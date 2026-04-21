import type { Profile, UserPermissions } from "@/types";

export const DEFAULT_PERMISSIONS: UserPermissions = {
  view_analytics: false,
  can_import: false,
  can_delete: false,
  manage_team: false,
};

export function normalizePermissions(profile: Partial<Profile> | null | undefined): UserPermissions {
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
