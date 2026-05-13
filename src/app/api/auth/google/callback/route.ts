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
      const supabase = createServerClient();
      const { error: dbError } = await supabase
        .from("settings")
        .update({ gmail_refresh_token: tokens.refresh_token })
        .eq("id", "00000000-0000-0000-0000-000000000000"); // Standard settings ID

      if (dbError) throw dbError;
    }

    // Redirect back to settings page
    return NextResponse.redirect(new URL('/settings?tab=email&auth=success', req.url));
  } catch (err: any) {
    console.error("[AUTH-GOOGLE-CALLBACK] Error:", err);
    return NextResponse.redirect(new URL('/settings?tab=email&auth=error', req.url));
  }
}
