import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { sendGmail } from "@/lib/gmail";

export async function POST(req: Request) {
  const limited = rateLimit(req, "outbound-email", 60, 60000);
  if (limited) return limited;

  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  try {
    const { email, subject, message, attachments } = await req.json();
    const supabase = createServerClient();

    // Check if we have a refresh token
    const { data: settings } = await supabase
      .from("settings")
      .select("gmail_refresh_token")
      .single();

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
        body: message.replace(/\n/g, '<br/>'),
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
