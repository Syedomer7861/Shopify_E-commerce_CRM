import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { memberScope } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { sendGmail } from "@/lib/gmail";
import { getSystemSettings } from "@/lib/server-settings";

// No CR/LF in anything that ends up in a MIME header.
const headerSafe = /^[^\r\n]*$/;

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
  subject: z.string().min(1).max(200).regex(headerSafe),
  message: z.string().min(1).max(20000),
  attachments: z.array(z.object({
    filename: z.string().min(1).max(120).regex(/^[^/\\\r\n"]+$/),
    content: z.string().min(1).max(7_000_000).regex(/^[A-Za-z0-9+/=]+$/),
    contentType: z.string().min(1).max(100).regex(/^[\w.+-]+\/[\w.+-]+$/),
  })).max(3).optional(),
});

export async function POST(req: Request) {
  const limited = await rateLimit(req, "outbound-email", 60, 60000);
  if (limited) return limited;

  const scope = await memberScope(req);
  if (scope.error) return scope.error;
  const orgId = scope.orgId ?? undefined;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Check the email address, subject and message." }, { status: 400 });
  }
  const { email, subject, message, attachments } = parsed.data;

  try {
    const supabase = createServerClient();
    // Settings of the caller's own organisation, so mail goes out from its own Gmail.
    const settings = await getSystemSettings(supabase, orgId);
    if (!settings?.gmail_refresh_token) {
      return NextResponse.json({ ok: false, error: "Gmail not authenticated. Please authorize in settings." }, { status: 400 });
    }

    await sendGmail({ to: email, subject, body: message, attachments, orgId });
    return NextResponse.json({ ok: true, message: "Email sent successfully via Gmail API" });
  } catch (error) {
    console.error("[EMAIL-API] send failed:", error);
    return NextResponse.json({ ok: false, error: "Could not send the email. Please try again." }, { status: 500 });
  }
}
