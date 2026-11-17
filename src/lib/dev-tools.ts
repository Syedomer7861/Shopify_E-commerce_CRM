import { createAdminClient } from "./supabase";

/**
 * Server-only. Per-organisation developer tool connections (GitHub, Vercel,
 * Supabase) for the live developer dashboard. Tokens live in
 * org_dev_connections (RLS on, no policies) and never leave the server:
 * every function here returns display data only.
 */

export const DEV_PROVIDERS = ["github", "vercel", "supabase"] as const;
export type DevProvider = (typeof DEV_PROVIDERS)[number];

export type DevConfig = { repos?: string[]; teamId?: string; projects?: string[]; label?: string };
type Conn = { provider: DevProvider; token: string; config: DevConfig; connected_at: string; last_status: string | null };

export const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
export const TEAM_RE = /^[\w-]{1,64}$/;
export const REF_RE = /^[a-z0-9]{20}$/;

const TIMEOUT = 8000;

async function getJson(url: string, token: string, extra: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": "crm-dev-dashboard", ...extra },
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new Error("Token rejected. Reconnect with a valid token.");
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

const GH = { "X-GitHub-Api-Version": "2022-11-28", Accept: "application/vnd.github+json" };
const vercelQs = (c: DevConfig) => (c.teamId ? `teamId=${encodeURIComponent(c.teamId)}` : "");

/** Checks the token works and returns an account label to show. Throws a user-safe message. */
export async function verifyDevToken(provider: DevProvider, token: string, config: DevConfig): Promise<string> {
  if (provider === "github") {
    const me = await getJson("https://api.github.com/user", token, GH);
    for (const r of config.repos ?? []) await getJson(`https://api.github.com/repos/${r}`, token, GH).catch(() => { throw new Error(`Cannot read repo ${r} with this token.`); });
    return String(me.login ?? "GitHub");
  }
  if (provider === "vercel") {
    const me = await getJson("https://api.vercel.com/v2/user", token);
    if (config.teamId) await getJson(`https://api.vercel.com/v6/deployments?limit=1&${vercelQs(config)}`, token).catch(() => { throw new Error("Cannot read that Vercel team with this token."); });
    return String(me.user?.username ?? me.user?.email ?? "Vercel");
  }
  const projects: { id: string }[] = await getJson("https://api.supabase.com/v1/projects", token);
  const missing = (config.projects ?? []).filter(ref => !projects.some(p => p.id === ref));
  if (missing.length) throw new Error(`Project ${missing[0]} not found for this token.`);
  return `${projects.length} project${projects.length === 1 ? "" : "s"}`;
}

export async function listDevConnections(orgId: string): Promise<Conn[]> {
  const { data } = await createAdminClient()
    .from("org_dev_connections")
    .select("provider, token, config, connected_at, last_status")
    .eq("org_id", orgId);
  return (data ?? []) as Conn[];
}

async function githubFeed(c: Conn) {
  const repos = (c.config.repos ?? []).slice(0, 10);
  const perRepo = await Promise.all(repos.map(async repo => {
    const [pulls, commits] = await Promise.all([
      getJson(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=10`, c.token, GH),
      getJson(`https://api.github.com/repos/${repo}/commits?per_page=5`, c.token, GH),
    ]);
    return {
      repo,
      url: `https://github.com/${repo}`,
      pulls: (pulls as any[]).map(p => ({ number: p.number, title: String(p.title), author: p.user?.login ?? null, url: p.html_url, draft: Boolean(p.draft), updatedAt: p.updated_at })),
      commits: (commits as any[]).map(k => ({ sha: String(k.sha).slice(0, 7), message: String(k.commit?.message ?? "").split("\n")[0], author: k.author?.login ?? k.commit?.author?.name ?? null, url: k.html_url, at: k.commit?.author?.date ?? null })),
    };
  }));
  return { account: c.config.label ?? null, repos: perRepo };
}

async function vercelFeed(c: Conn) {
  const qs = vercelQs(c.config);
  const data = await getJson(`https://api.vercel.com/v6/deployments?limit=10${qs ? `&${qs}` : ""}`, c.token);
  return {
    account: c.config.label ?? null,
    deployments: ((data.deployments ?? []) as any[]).map(d => ({
      id: d.uid,
      project: d.name,
      state: d.state ?? d.readyState ?? null,
      target: d.target ?? "preview",
      url: d.url ? `https://${d.url}` : null,
      inspectorUrl: d.inspectorUrl ?? null,
      message: d.meta?.githubCommitMessage ? String(d.meta.githubCommitMessage).split("\n")[0] : null,
      branch: d.meta?.githubCommitRef ?? null,
      createdAt: d.created ? new Date(d.created).toISOString() : null,
    })),
  };
}

async function supabaseFeed(c: Conn) {
  const all: any[] = await getJson("https://api.supabase.com/v1/projects", c.token);
  const wanted = c.config.projects?.length ? all.filter(p => c.config.projects!.includes(p.id)) : all;
  return {
    account: c.config.label ?? null,
    projects: wanted.slice(0, 10).map(p => ({ ref: p.id, name: p.name, status: p.status, region: p.region, url: `https://supabase.com/dashboard/project/${p.id}` })),
  };
}

const FEEDS = { github: githubFeed, vercel: vercelFeed, supabase: supabaseFeed } as const;

export type DevFeed = { connected: DevProvider[]; fetchedAt: string } & Partial<Record<DevProvider, { ok: true; data: any } | { ok: false; error: string }>>;

// ponytail: per-instance memory cache, fine for a dashboard poll; move to shared cache if provider rate limits bite.
const cache = new Map<string, { at: number; feed: DevFeed }>();
const TTL = 60_000;

/** Live feed for one org. Cached 60 s so many open dashboards cost one provider call per minute. */
export async function getDevFeed(orgId: string): Promise<DevFeed> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL) return hit.feed;
  const conns = await listDevConnections(orgId);
  const results = await Promise.all(conns.map(async c => {
    try {
      return [c.provider, { ok: true as const, data: await FEEDS[c.provider](c) }] as const;
    } catch (e) {
      return [c.provider, { ok: false as const, error: e instanceof Error && e.name !== "TimeoutError" ? e.message : "Provider did not answer in time." }] as const;
    }
  }));
  const feed: DevFeed = { connected: conns.map(c => c.provider), fetchedAt: new Date().toISOString(), ...Object.fromEntries(results) };
  cache.set(orgId, { at: Date.now(), feed });
  return feed;
}

export function clearDevFeedCache(orgId: string) {
  cache.delete(orgId);
}
