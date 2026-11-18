import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getGmailClient } from "@/lib/gmail";
import { ensureAdmin } from "@/lib/auth-utils";

export async function GET() {
  // Only an organisation admin connects a mailbox; the callback stores the token against their organisation.
  const { errorResponse } = await ensureAdmin();
  if (errorResponse) return errorResponse;

  try {
    const oauth2Client = await getGmailClient();
    // Anti-forgery: the callback only accepts a code that comes back with this value.
    const state = randomBytes(24).toString("hex");

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Forces refresh token to be sent
      state,
      scope: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
    });

    const res = NextResponse.redirect(authUrl);
    res.cookies.set("gmail_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/google", maxAge: 600 });
    return res;
  } catch (error: any) {
    console.error("[AUTH-GOOGLE] Error generating auth URL:", error);
    return NextResponse.json({ error: "Could not start Gmail sign-in" }, { status: 500 });
  }
}
