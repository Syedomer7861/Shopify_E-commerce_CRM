import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { ensureAdmin } from "@/lib/auth-utils";
import { GOOGLE_SCOPES, googleAppConfigured, googleOAuthClient } from "@/lib/google-org";

export const dynamic = "force-dynamic";

/** Starts "Connect Google Drive & Sheets" for the signed-in admin's org. */
export async function GET() {
  const { errorResponse } = await ensureAdmin();
  if (errorResponse) return errorResponse;
  if (!googleAppConfigured()) return NextResponse.json({ error: "Google connection is not enabled on this server." }, { status: 503 });

  // One-time state bound to this browser, checked in the callback (blocks login CSRF).
  const state = randomBytes(24).toString("hex");
  const url = googleOAuthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GOOGLE_SCOPES, state });
  const res = NextResponse.redirect(url);
  res.cookies.set("g_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google", maxAge: 600 });
  return res;
}
