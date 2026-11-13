import { NextResponse } from "next/server";
import { getGmailClient } from "@/lib/gmail";
import { ensureAdmin } from "@/lib/auth-utils";

export async function GET() {
  // Only an organisation admin connects a mailbox; the callback stores the token against their organisation.
  const { errorResponse } = await ensureAdmin();
  if (errorResponse) return errorResponse;

  try {
    const oauth2Client = await getGmailClient();
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Forces refresh token to be sent
      scope: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
    });

    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error("[AUTH-GOOGLE] Error generating auth URL:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
