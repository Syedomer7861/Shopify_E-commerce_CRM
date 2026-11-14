"use server";
import { createServerClient, createAdminClient } from "@/lib/supabase";
import type { UserPermissions } from "@/types";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

/**
 * Next.js Server Actions are reachable directly (their action ID ships in
 * the client bundle) independent of any page-level UI gate - these three
 * all immediately reach for the service-role key, so each one needs its
 * own check that the actual calling session is an admin, and that the
 * target belongs to the caller's own organisation (the service key ignores
 * row security, so nothing else stops a cross-tenant write).
 *
 * Returns the caller's org id, or null when the caller is not an admin.
 * Read through the caller's own session, so a suspended or unpaid
 * workspace (locked out by RLS) gets null too.
 */
async function requireAdminCaller(): Promise<string | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, org_id").eq("id", user.id).single();
  return profile?.role === "admin" && profile.org_id ? profile.org_id : null;
}

/** The target user is in the caller's org and is not the platform owner. */
async function ownTeamMember(admin: ReturnType<typeof createAdminClient>, orgId: string, userId: string) {
  const { data } = await admin.from("profiles").select("org_id, is_platform_admin").eq("id", userId).maybeSingle();
  return !!data && data.org_id === orgId && !data.is_platform_admin;
}

const ADMIN_PERMISSIONS = {
  view_analytics: true, can_import: true, can_delete: true, manage_team: true, manage_orders: true,
  manage_customers: true, send_whatsapp: true, audit_tasks: true, manage_automations: true,
};

/**
 * Creates a new team member with Email & Password.
 * This runs on the server using the SUPABASE_SERVICE_ROLE_KEY.
 */
export async function createTeamMemberServer({
  email,
  password,
  name,
  role,
  permissions
}: {
  email: string;
  password: string;
  name: string;
  // Any org-defined role name from the `roles` table, not just the 5 built-ins
  // (see src/types/index.ts's Profile.role comment for why this is widened).
  role: string;
  permissions: UserPermissions;
}) {
  const orgId = await requireAdminCaller();
  if (!orgId) return { success: false, error: "Unauthorized" };
  const supabaseAdmin = createAdminClient();

  try {
    const cleanEmail = email.toLowerCase().trim();

    // 1. Create the login. app_metadata (settable only with the service key)
    // tells the profile trigger which organisation this person joins.
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { org_id: orgId, role: role === "admin" ? "admin" : "agent" },
    });

    let userId: string | undefined = createData?.user?.id;

    // 2. Already registered: only someone already in this organisation can be re-added.
    if (createError) {
      if (!(createError.message.toLowerCase().includes("already registered") || createError.status === 422)) throw createError;
      const { data: existing } = await supabaseAdmin.from("profiles").select("id").eq("email", cleanEmail).maybeSingle();
      if (!existing || !(await ownTeamMember(supabaseAdmin, orgId, existing.id))) {
        return { success: false, error: "This email already has an account in another workspace." };
      }
      userId = existing.id;
    }

    if (!userId) throw new Error("User conflict: Could not determine account ID.");

    // 3. Upsert the profile entry to make them visible and active in the CRM
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        email: cleanEmail,
        name,
        role,
        org_id: orgId,
        permissions: role === "admin" ? ADMIN_PERMISSIONS : (permissions || DEFAULT_PERMISSIONS),
        is_active: true
      }, { onConflict: 'id' });

    if (profileError) {
      console.error("Team member profile upsert failed:", profileError.message);
      throw profileError;
    }

    return { success: true };
  } catch (error: any) {
    console.error("Create team member failed:", error?.message);
    return { success: false, error: error.message || "Failed to fully sync user account" };
  }
}

/**
 * Updates a team member's password.
 * This runs on the server using the SUPABASE_SERVICE_ROLE_KEY.
 */
export async function updateTeamMemberPasswordServer(userId: string, newPassword: string) {
  const orgId = await requireAdminCaller();
  if (!orgId) return { success: false, error: "Unauthorized" };
  const supabaseAdmin = createAdminClient();
  if (!(await ownTeamMember(supabaseAdmin, orgId, userId))) return { success: false, error: "Unauthorized" };

  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Update password failed:", error?.message);
    return { success: false, error: error.message || "Failed to update password" };
  }
}

/**
 * Deletes a team member completely.
 * Removes them from both the profiles table and Supabase Auth.
 */
export async function deleteTeamMemberServer(userId: string) {
  const orgId = await requireAdminCaller();
  if (!orgId) return { success: false, error: "Unauthorized" };
  const supabaseAdmin = createAdminClient();
  if (!(await ownTeamMember(supabaseAdmin, orgId, userId))) return { success: false, error: "Unauthorized" };

  try {
    // 1. Delete from profiles table (Referential integrity handles logs if configured)
    const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("id", userId);
    if (profileError) throw profileError;

    // 2. Delete from Supabase Auth
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Delete user failed:", error?.message);
    return { success: false, error: error.message || "Failed to delete user account" };
  }
}
