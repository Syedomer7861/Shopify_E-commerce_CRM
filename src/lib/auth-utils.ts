import { createServerClient } from "./supabase";
import { NextResponse } from "next/server";

/**
 * Ensures the request is authenticated and returns the user/profile.
 * Returns a Response object if authentication fails.
 */
export async function getAuthenticatedSession() {
  const supabase = createServerClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Please log in to access this resource" },
        { status: 401 }
      ),
      user: null,
      supabase: null
    };
  }

  // Fetch profile to get role/permissions
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return {
    errorResponse: null,
    user,
    profile,
    supabase
  };
}

/**
 * Ensures the user has admin role.
 */
export async function ensureAdmin() {
  const { errorResponse, profile, supabase } = await getAuthenticatedSession();
  
  if (errorResponse) return { errorResponse, profile: null, supabase: null };

  if (profile?.role !== "admin") {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      ),
      profile,
      supabase
    };
  }

  return { errorResponse: null, profile, supabase };
}
