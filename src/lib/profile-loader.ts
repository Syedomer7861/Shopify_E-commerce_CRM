import type { Profile, UserPermissions } from "@/types";
import type { Grants } from "./access";

/**
 * The one place a profile row is read together with its role's live
 * definition from `roles` (what normalizePermissions/allowedNavModules in
 * ./permissions key off). Works with any Supabase client - browser, server
 * (cookie session) or service-role - so the hook, the sidebar, the dashboard
 * and API guards all resolve permissions identically. Returns null when the
 * profile row doesn't exist.
 */
export async function loadProfile(supabase: any, userId: string): Promise<Profile | null> {
  // In the browser the provider, the sidebar and the dashboard all ask for the
  // same profile within the same moment of page load (and again on the
  // INITIAL_SESSION auth event). Share the one request that is already in
  // flight; each caller gets its own copy. Nothing is kept once it settles.
  if (typeof window === "undefined") return fetchProfile(supabase, userId);
  let pending = inFlight.get(userId);
  if (!pending) {
    pending = fetchProfile(supabase, userId).finally(() => inFlight.delete(userId));
    inFlight.set(userId, pending);
  }
  const shared = await pending;
  return shared ? { ...shared } : null;
}

const inFlight = new Map<string, Promise<Profile | null>>();

async function fetchProfile(supabase: any, userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!data) return null;

  const profile = data as Profile;
  if (profile.role && profile.org_id) {
    // Role definition and org switches are independent: one round trip, not two.
    const [{ data: roleRow }, row] = await Promise.all([
      supabase
        .from("roles")
        .select("*") // "*" so a database without roles.grants (pre-20261111c) still resolves
        .eq("org_id", profile.org_id)
        .eq("name", profile.role)
        .maybeSingle(),
      // The function arrives with 20261111g; before that the call errors and is ignored.
      orgControls(supabase, profile.org_id),
    ]);
    if (roleRow) {
      profile.role_permissions = (roleRow.permissions as UserPermissions) || undefined;
      profile.role_nav_modules = roleRow.nav_modules as string[] | null;
      profile.role_grants = (roleRow.grants as Grants) || undefined;
      profile.role_home_widgets = (roleRow.home_widgets as string[] | null) ?? null;
    }
    if (row) {
      profile.org_disabled_modules = row.disabled_modules || [];
      profile.org_platform_blocked_modules = row.platform_blocked_modules || [];
      profile.org_feature_flags = row.feature_flags || [];
      profile.org_session_timeout_minutes = row.session_timeout_minutes ?? null;
    }
  }
  return profile;
}

// loadProfile runs many times per page (sidebar, dashboard, guards), and org
// controls change rarely - so one lookup per org per 5 minutes. A missing
// function (pre-20261111g database) is cached the same way.
type OrgControls = {
  disabled_modules: string[] | null; session_timeout_minutes: number | null;
  platform_blocked_modules?: string[] | null; feature_flags?: string[] | null; // absent before 20261113i
};
const controlsCache = new Map<string, { at: number; row: OrgControls | null }>();
const CONTROLS_TTL_MS = 5 * 60_000;

async function orgControls(supabase: any, orgId: string): Promise<OrgControls | null> {
  const hit = controlsCache.get(orgId);
  if (hit && Date.now() - hit.at < CONTROLS_TTL_MS) return hit.row;
  const { data, error } = await supabase.rpc("my_org_controls");
  const row: OrgControls | null = error ? null : (Array.isArray(data) ? data[0] : data) ?? null;
  controlsCache.set(orgId, { at: Date.now(), row });
  return row;
}
