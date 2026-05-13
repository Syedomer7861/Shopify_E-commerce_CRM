import { createServerClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createServerClient();

  const targetEmail = "admin@cureforever.in";

  try {
    // 1. Get the user ID from auth.users (via service role)
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) throw authError;

    const user = authData.users.find(u => u.email === targetEmail);
    if (!user) {
      return NextResponse.json({ error: `User ${targetEmail} not found in Supabase Auth.` }, { status: 404 });
    }

    // 2. Upsert the profile with admin role
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        role: "admin",
        name: "Admin User",
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });

    if (profileError) throw profileError;

    return NextResponse.json({ 
      success: true, 
      message: `User ${targetEmail} has been promoted to Admin successfully.`,
      id: user.id
    });

  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
