import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ensureAdmin } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { googleOAuthClient } from "@/lib/google-org";

export const dynamic = "force-dynamic";

const back = (req: NextRequest, result: string) => {
  const res = NextResponse.redirect(new URL(`/settings?tab=backup&google=${result}`, req.url));
  res.cookies.delete({ name: "g_oauth_state", path: "/api/google" });
  return res;
};

export async function GET(req: NextRequest) {
  const { errorResponse, profile } = await ensureAdmin();
  if (errorResponse) return errorResponse;
  if (!profile?.org_id) return back(req, "error");

  const q = req.nextUrl.searchParams;
  const state = q.get("state") || "";
  const expected = req.cookies.get("g_oauth_state")?.value || "";
  if (!expected || state.length !== expected.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) return back(req, "error");
  const code = q.get("code");
  if (q.get("error") || !code) return back(req, "cancelled");

  try {
    const client = googleOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) return back(req, "error");
    if (!String(tokens.scope || "").includes("drive.file")) return back(req, "noscope");
    client.setCredentials(tokens);
    const info = await client.getTokenInfo(tokens.access_token!);

    const { error } = await createAdminClient().from("org_google_connections").upsert({
      org_id: profile.org_id,
      refresh_token: tokens.refresh_token,
      email: info.email || null,
      connected_by: profile.id,
      connected_at: new Date().toISOString(),
      last_backup_status: null,
    }, { onConflict: "org_id" });
    if (error) throw error;
    return back(req, "connected");
  } catch (e: any) {
    console.error("[google/callback]", e?.message);
    return back(req, "error");
  }
}
