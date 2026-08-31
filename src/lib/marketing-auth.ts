import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/auth-utils";
import { isWorkspaceAdmin } from "@/lib/permissions";

/**
 * Coarse guard for /api/marketing/* (the workspace) routes: a signed-in user
 * who is either a workspace-admin (admin / manager / manage_workspaces) or a
 * member of at least one Space. Per-Space access is enforced fine-grained by
 * RLS (can_access_space) on every table, so this only keeps total outsiders
 * out with a clean 403 instead of empty results / policy errors.
 *
 * Note: references getAuthenticatedSession so scripts/check-route-guards.mjs
 * still sees a known guard in routes that only import requireMarketing.
 */
export async function requireMarketing() {
  const { errorResponse, user, profile, supabase } = await getAuthenticatedSession();
  if (errorResponse) {
    return { errorResponse, user: null, profile: null, supabase: null };
  }

  if (!isWorkspaceAdmin(profile)) {
    const { count } = await supabase!
      .from("mkt_space_members")
      .select("space_id", { count: "exact", head: true })
      .eq("user_id", user!.id);
    if (!count) {
      return {
        errorResponse: NextResponse.json(
          { error: "Forbidden: you are not a member of any workspace Space" },
          { status: 403 }
        ),
        user,
        profile,
        supabase: null,
      };
    }
  }

  return { errorResponse: null, user, profile, supabase };
}

/** Stricter guard: caller must be a workspace-admin (create/delete Spaces). */
export async function requireWorkspaceAdmin() {
  const { errorResponse, user, profile, supabase } = await getAuthenticatedSession();
  if (errorResponse) return { errorResponse, user: null, profile: null, supabase: null };
  if (!isWorkspaceAdmin(profile)) {
    return {
      errorResponse: NextResponse.json({ error: "Forbidden: workspace admin required" }, { status: 403 }),
      user,
      profile,
      supabase: null,
    };
  }
  return { errorResponse: null, user, profile, supabase };
}
