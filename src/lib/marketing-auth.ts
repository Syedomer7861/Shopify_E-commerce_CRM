import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/auth-utils";
import { canAccessMarketing } from "@/lib/permissions";

/**
 * Guard for /api/marketing/* routes. Requires a signed-in user who passes
 * canAccessMarketing() (admin, manager, marketing role, or the
 * manage_marketing permission flag). Returns { errorResponse } set on failure.
 *
 * Note: this file references getAuthenticatedSession so scripts/check-route-guards.mjs
 * still sees a known guard even in routes that only import requireMarketing.
 */
export async function requireMarketing() {
  const { errorResponse, user, profile, supabase } = await getAuthenticatedSession();
  if (errorResponse) {
    return { errorResponse, user: null, profile: null, supabase: null };
  }
  if (!canAccessMarketing(profile)) {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Marketing workspace access required" },
        { status: 403 }
      ),
      user,
      profile,
      supabase: null,
    };
  }
  return { errorResponse: null, user, profile, supabase };
}
