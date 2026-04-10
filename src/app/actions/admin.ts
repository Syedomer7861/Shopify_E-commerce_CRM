"use server";
import { createClient } from "@supabase/supabase-js";
import type { UserPermissions } from "@/types";

const DEFAULT_PERMISSIONS: UserPermissions = {
  view_analytics: false,
  can_import: false,
  can_delete: false,
  manage_team: false,
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
  role: "admin" | "agent";
  permissions: UserPermissions;
}) {
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
