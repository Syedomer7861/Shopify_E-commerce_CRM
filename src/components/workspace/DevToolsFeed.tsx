"use client";

import { useEffect, useState } from "react";
import { GitBranch, GitPullRequest, Rocket, Database, ExternalLink, RefreshCw } from "lucide-react";
import { StatCard } from "@/components/ui";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type Pull = { number: number; title: string; author: string | null; url: string; draft: boolean; updatedAt: string };
type Commit = { sha: string; message: string; author: string | null; url: string; at: string | null };
type Repo = { repo: string; url: string; pulls: Pull[]; commits: Commit[] };
type Deploy = { id: string; project: string; state: string | null; target: string; url: string | null; inspectorUrl: string | null; message: string | null; branch: string | null; createdAt: string | null };
type Project = { ref: string; name: string; status: string; region: string; url: string };
type Feed = {
  connected: string[];
  fetchedAt?: string;
  github?: Result<{ repos: Repo[] }>;
  vercel?: Result<{ deployments: Deploy[] }>;
  supabase?: Result<{ projects: Project[] }>;
};

const POLL = 60_000;

const ago = (iso: string | null) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

const STATE_COLOR: Record<string, string> = {
  READY: "bg-emerald-50 text-emerald-700", ERROR: "bg-rose-50 text-rose-700", CANCELED: "bg-[#ebece6] text-[#5f5f5d]",
  BUILDING: "bg-amber-50 text-amber-700", QUEUED: "bg-amber-50 text-amber-700", INITIALIZING: "bg-amber-50 text-amber-700",
  ACTIVE_HEALTHY: "bg-emerald-50 text-emerald-700", INACTIVE: "bg-[#ebece6] text-[#5f5f5d]",
};
const Badge = ({ s }: { s: string | null }) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATE_COLOR[s ?? ""] ?? "bg-rose-50 text-rose-700"}`}>{(s ?? "unknown").replace(/_/g, " ").toLowerCase()}</span>;

function Panel({ title, icon: Icon, error, children }: { title: string; icon: typeof GitBranch; error?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[#1c1c1c] mb-3"><Icon className="w-4 h-4" /> {title}</h3>
      {error ? <p className="text-xs text-rose-600">{error}</p> : children}
    </div>
  );
}

/** Live GitHub / Vercel / Supabase feed for the home dashboard. Hidden until an admin connects a tool in Settings. */
export function DevToolsFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/devtools/feed", { cache: "no-store" })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (active && d) setFeed(d); })
        .catch(() => { /* keep last good data; next poll retries */ });
    };
    load();
    const id = setInterval(load, POLL);
    document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(id); document.removeEventListener("visibilitychange", load); };
  }, []);

  if (!feed || feed.connected.length === 0) return null;

  const gh = feed.github?.ok ? feed.github.data.repos : [];
  const pulls = gh.flatMap(r => r.pulls.map(p => ({ ...p, repo: r.repo }))).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const commits = gh.flatMap(r => r.commits.map(c => ({ ...c, repo: r.repo }))).sort((a, b) => Date.parse(b.at ?? "0") - Date.parse(a.at ?? "0"));
  const deploys = feed.vercel?.ok ? feed.vercel.data.deployments : [];
  const projects = feed.supabase?.ok ? feed.supabase.data.projects : [];
  const lastProd = deploys.find(d => d.target === "production");
  const err = (r?: Result<unknown>) => (r && !r.ok ? r.error : undefined);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#1c1c1c]">Developer live feed</h2>
        <span className="flex items-center gap-1 text-[10px] text-[#5f5f5d]"><RefreshCw className="w-3 h-3" /> updated {ago(feed.fetchedAt ?? null)} · refreshes every minute</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {feed.github && <StatCard label="Open pull requests" value={feed.github.ok ? pulls.length : "—"} />}
        {feed.github && <StatCard label="Repos watched" value={gh.length} />}
        {feed.vercel && <StatCard label="Last production deploy" value={lastProd ? (lastProd.state ?? "—").toLowerCase() : "—"} />}
        {feed.supabase && <StatCard label="Healthy projects" value={feed.supabase.ok ? `${projects.filter(p => p.status === "ACTIVE_HEALTHY").length}/${projects.length}` : "—"} />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {feed.github && (
          <Panel title="Pull requests" icon={GitPullRequest} error={err(feed.github)}>
            {pulls.length === 0 ? <p className="text-xs text-[#5f5f5d]">No open pull requests.</p> : (
              <ul className="space-y-2">
                {pulls.slice(0, 8).map(p => (
                  <li key={`${p.repo}#${p.number}`}>
                    <a href={p.url} target="_blank" rel="noreferrer" className="block text-xs hover:underline">
                      <span className="font-semibold text-[#1c1c1c]">{p.title}</span>{p.draft && <span className="ml-1 text-[#5f5f5d]">(draft)</span>}
                      <span className="block text-[10px] text-[#5f5f5d]">{p.repo} #{p.number} · {p.author} · {ago(p.updatedAt)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        {feed.vercel && (
          <Panel title="Deployments" icon={Rocket} error={err(feed.vercel)}>
            {deploys.length === 0 ? <p className="text-xs text-[#5f5f5d]">No deployments yet.</p> : (
              <ul className="space-y-2">
                {deploys.slice(0, 8).map(d => (
                  <li key={d.id} className="flex items-start justify-between gap-2 text-xs">
                    <a href={d.inspectorUrl ?? d.url ?? "#"} target="_blank" rel="noreferrer" className="hover:underline min-w-0">
                      <span className="font-semibold text-[#1c1c1c]">{d.project}</span> <span className="text-[#5f5f5d]">{d.target}</span>
                      <span className="block text-[10px] text-[#5f5f5d] truncate">{d.message ?? d.branch ?? ""} · {ago(d.createdAt)}</span>
                    </a>
                    <Badge s={d.state} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        {feed.github && (
          <Panel title="Recent commits" icon={GitBranch} error={err(feed.github)}>
            {commits.length === 0 ? <p className="text-xs text-[#5f5f5d]">No commits.</p> : (
              <ul className="space-y-2">
                {commits.slice(0, 8).map(c => (
                  <li key={`${c.repo}${c.sha}`}>
                    <a href={c.url} target="_blank" rel="noreferrer" className="block text-xs hover:underline">
                      <span className="font-mono text-[10px] text-[#5f5f5d] mr-1">{c.sha}</span><span className="text-[#1c1c1c]">{c.message}</span>
                      <span className="block text-[10px] text-[#5f5f5d]">{c.repo} · {c.author} · {ago(c.at)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        {feed.supabase && (
          <Panel title="Supabase projects" icon={Database} error={err(feed.supabase)}>
            {projects.length === 0 ? <p className="text-xs text-[#5f5f5d]">No projects.</p> : (
              <ul className="space-y-2">
                {projects.map(p => (
                  <li key={p.ref} className="flex items-center justify-between gap-2 text-xs">
                    <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline font-semibold text-[#1c1c1c]">{p.name} <span className="font-normal text-[10px] text-[#5f5f5d]">{p.region}</span></a>
                    <Badge s={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
      {gh.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {gh.map(r => (
            <a key={r.repo} href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#ebece6] text-xs text-[#1c1c1c] hover:bg-[#f6f7f2]">
              <ExternalLink className="w-3 h-3" /> {r.repo}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
