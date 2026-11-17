import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureAdmin } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { DEV_PROVIDERS, REF_RE, REPO_RE, TEAM_RE, clearDevFeedCache, listDevConnections, verifyDevToken } from "@/lib/dev-tools";

export const dynamic = "force-dynamic";

/** Which tools this admin's org has connected. Never returns tokens. */
export async function GET() {
  const { errorResponse, profile } = await ensureAdmin();
  if (errorResponse) return errorResponse;
  const conns = profile?.org_id ? await listDevConnections(profile.org_id) : [];
  return NextResponse.json({
    connections: conns.map(c => ({ provider: c.provider, config: c.config, connectedAt: c.connected_at, lastStatus: c.last_status })),
  });
}

const Body = z.object({
  provider: z.enum(DEV_PROVIDERS),
  token: z.string().trim().min(10).max(500),
  repos: z.array(z.string().trim().regex(REPO_RE)).max(10).optional(),
  teamId: z.string().trim().regex(TEAM_RE).optional().or(z.literal("")),
  projects: z.array(z.string().trim().regex(REF_RE)).max(10).optional(),
});

/** Connect or replace one tool. The token is checked against the provider before it is saved. */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "devtools-connect", 10, 60_000);
  if (limited) return limited;
  const { errorResponse, profile, supabase } = await ensureAdmin();
  if (errorResponse) return errorResponse;
  if (!profile?.org_id) return NextResponse.json({ error: "No organisation" }, { status: 400 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the token and the repo / project names." }, { status: 400 });
  const { provider, token, repos, teamId, projects } = parsed.data;
  const config = provider === "github" ? { repos: repos ?? [] } : provider === "vercel" ? (teamId ? { teamId } : {}) : { projects: projects ?? [] };

  let label: string;
  try {
    label = await verifyDevToken(provider, token, config);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error && e.name !== "TimeoutError" ? e.message : "Provider did not answer. Try again." }, { status: 400 });
  }

  const { data: { user } } = await supabase!.auth.getUser();
  const { error } = await createAdminClient().from("org_dev_connections").upsert({
    org_id: profile.org_id,
    provider,
    token,
    config: { ...config, label },
    connected_by: user?.id ?? null,
    connected_at: new Date().toISOString(),
    last_status: "ok",
  });
  if (error) {
    console.error("devtools connect failed", error.message);
    return NextResponse.json({ error: "Could not save the connection." }, { status: 500 });
  }
  clearDevFeedCache(profile.org_id);
  return NextResponse.json({ ok: true, label });
}

/** Disconnect one tool: ?provider=github */
export async function DELETE(req: NextRequest) {
  const { errorResponse, profile } = await ensureAdmin();
  if (errorResponse) return errorResponse;
  const provider = z.enum(DEV_PROVIDERS).safeParse(req.nextUrl.searchParams.get("provider"));
  if (!provider.success) return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
  if (profile?.org_id) {
    await createAdminClient().from("org_dev_connections").delete().eq("org_id", profile.org_id).eq("provider", provider.data);
    clearDevFeedCache(profile.org_id);
  }
  return NextResponse.json({ ok: true });
}
