"use server";
import { createServerClient } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import type { UserPermissions } from "@/types";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

/**
 * Next.js Server Actions are reachable directly (their action ID ships in
 * the client bundle) independent of any page-level UI gate - these three
 * all immediately reach for the service-role key, so each one needs its
 * own check that the actual calling session is an admin.
 */
async function requireAdminCaller() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

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
  role: "admin" | "agent" | "hr" | "manager" | "marketing";
  permissions: UserPermissions;
}) {
  if (!(await requireAdminCaller())) return { success: false, error: "Unauthorized" };

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
  );

  try {
    const cleanEmail = email.toLowerCase().trim();

    // 1. Attempt to create the user in Supabase Auth
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    let userId: string | undefined = createData?.user?.id;

    // 2. If creation fails (e.g. user already exists), try to find the existing user's ID
    if (createError) {
      if (createError.message.toLowerCase().includes("already registered") || createError.status === 422) {
        console.log("DEBUG: User already exists in Auth, fetching existing ID...");
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;
        
        const existingUser = listData.users.find(u => u.email?.toLowerCase() === cleanEmail);
        if (existingUser) {
          userId = existingUser.id;
          console.log("DEBUG: Found existing user ID:", userId);
        } else {
          throw createError;
        }
      } else {
        throw createError;
      }
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
        permissions: role === "admin" ? {
            view_analytics: true,
            can_import: true,
            can_delete: true,
            manage_team: true,
            manage_orders: true,
            manage_customers: true,
            send_whatsapp: true,
            audit_tasks: true,
            manage_automations: true,
        } : (permissions || DEFAULT_PERMISSIONS),
        is_active: true
      }, { onConflict: 'id' });

    if (profileError) {
      console.error("DEBUG: Profile Upsert Error:", profileError);
      throw profileError;
    }

    return { success: true };
  } catch (error: any) {
    console.error("DEBUG: Admin Final Error:", error);
    return { success: false, error: error.message || "Failed to fully sync user account" };
  }
}

/**
 * Updates a team member's password.
 * This runs on the server using the SUPABASE_SERVICE_ROLE_KEY.
 */
export async function updateTeamMemberPasswordServer(userId: string, newPassword: string) {
  if (!(await requireAdminCaller())) return { success: false, error: "Unauthorized" };

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
  );

  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("DEBUG: Update Password Error:", error);
    return { success: false, error: error.message || "Failed to update password" };
  }
}

/**
 * Deletes a team member completely.
 * Removes them from both the profiles table and Supabase Auth.
 */
export async function deleteTeamMemberServer(userId: string) {
  if (!(await requireAdminCaller())) return { success: false, error: "Unauthorized" };

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
  );

  try {
    // 1. Delete from profiles table (Referential integrity handles logs if configured)
    const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("id", userId);
    if (profileError) throw profileError;

    // 2. Delete from Supabase Auth
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("DEBUG: Delete User Error:", error);
    return { success: false, error: error.message || "Failed to delete user account" };
  }
}
