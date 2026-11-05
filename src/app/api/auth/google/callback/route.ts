import { NextResponse } from "next/server";
import { getGmailClient } from "@/lib/gmail";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    const oauth2Client = await getGmailClient();
    const { tokens } = await oauth2Client.getToken(code);
    
    if (tokens.refresh_token) {
      // This callback runs in the same browser session as the admin who
      // clicked "Connect Gmail" on the Settings page, so their own org is
      // just a profile lookup away - no need to carry it through an OAuth
      // state param.
      const supabase = createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No active session to resolve an organization for");

      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
      if (!profile?.org_id) throw new Error("Could not resolve the organization for this account");

      const { error: dbError } = await supabase
        .from("settings")
        .update({ gmail_refresh_token: tokens.refresh_token })
        .eq("org_id", profile.org_id);

      if (dbError) throw dbError;
    }

    // Redirect back to settings page
    return NextResponse.redirect(new URL('/settings?tab=email&auth=success', req.url));
  } catch (err: any) {
    console.error("[AUTH-GOOGLE-CALLBACK] Error:", err);
    return NextResponse.redirect(new URL('/settings?tab=email&auth=error', req.url));
  }
}
