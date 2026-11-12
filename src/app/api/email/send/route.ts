import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { sendGmail } from "@/lib/gmail";
import { getSystemSettings } from "@/lib/server-settings";

export async function POST(req: Request) {
  const limited = await rateLimit(req, "outbound-email", 60, 60000);
  if (limited) return limited;

  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  try {
    const { email, subject, message, attachments } = await req.json();
    const supabase = createServerClient();

    // Check if we have a refresh token. settings RLS is admin-only now, and
    // this route is reachable by any authenticated caller (requireInternal),
    // so it needs the service-role fallback rather than a raw .select().
    const settings = await getSystemSettings(supabase);

    if (!settings?.gmail_refresh_token) {
      return NextResponse.json({ 
        ok: false, 
        error: "Gmail not authenticated. Please authorize in settings." 
      }, { status: 400 });
    }

    console.log(`[EMAIL-API] Sending real email via Gmail to ${email}: ${subject}`);

    try {
      await sendGmail({
        to: email,
        subject,
        body: message, // sendGmail builds both the plain-text and HTML parts from this
        attachments
      });

      return NextResponse.json({ 
        ok: true, 
        message: "Email sent successfully via Gmail API" 
      });
    } catch (gmailError: any) {
      console.error("[EMAIL-API] Gmail Error:", gmailError);
      return NextResponse.json({ 
        ok: false, 
        error: "Gmail API Error: " + (gmailError.message || "Unknown error")
      }, { status: 500 });
    }

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
