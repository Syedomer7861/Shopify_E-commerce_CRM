"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, GitBranch, Loader2, Rocket, Database } from "lucide-react";

type Provider = "github" | "vercel" | "supabase";
type Conn = { provider: Provider; config: { repos?: string[]; teamId?: string; projects?: string[]; label?: string }; connectedAt: string };

const TOOLS: { key: Provider; name: string; icon: typeof GitBranch; tokenHelp: string; tokenUrl: string; extra: string; extraHelp: string }[] = [
  {
    key: "github", name: "GitHub", icon: GitBranch,
    tokenHelp: "Fine-grained token with read-only Contents, Pull requests and Metadata on the repos below.",
    tokenUrl: "https://github.com/settings/personal-access-tokens/new",
    extra: "Repos (owner/name, comma separated, up to 10)", extraHelp: "acme/website, acme/api",
  },
  {
    key: "vercel", name: "Vercel", icon: Rocket,
    tokenHelp: "Account token from Vercel. Leave team empty for a personal account.",
    tokenUrl: "https://vercel.com/account/settings/tokens",
    extra: "Team ID (optional)", extraHelp: "team_abc123",
  },
  {
    key: "supabase", name: "Supabase", icon: Database,
    tokenHelp: "Personal access token from Supabase. It can read every project on the account, so use an account you trust.",
    tokenUrl: "https://supabase.com/dashboard/account/tokens",
    extra: "Project refs (comma separated, empty = all, up to 10)", extraHelp: "abcdefghijklmnopqrst",
  },
];

const list = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);

/** Settings > Developer tools: admin links GitHub, Vercel and Supabase for the live developer dashboard. */
export default function DevToolsCard() {
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [form, setForm] = useState<Record<Provider, { token: string; extra: string }>>({ github: { token: "", extra: "" }, vercel: { token: "", extra: "" }, supabase: { token: "", extra: "" } });
  const [busy, setBusy] = useState<Provider | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/devtools/connection", { cache: "no-store" });
    if (res.ok) setConns((await res.json()).connections);
    else setDenied(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  const connect = async (p: Provider) => {
    const { token, extra } = form[p];
    const body = { provider: p, token, ...(p === "github" ? { repos: list(extra) } : p === "vercel" ? { teamId: extra.trim() } : { projects: list(extra) }) };
    setBusy(p);
    try {
      const res = await fetch("/api/devtools/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`${p} connected as ${data.label}`);
        setForm(f => ({ ...f, [p]: { token: "", extra: "" } }));
        await load();
      } else toast.error(data.error || "Could not connect");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (p: Provider) => {
    if (!confirm(`Disconnect ${p}? The dashboard stops showing its data. The token is deleted here; revoke it at ${p} too.`)) return;
    setBusy(p);
    try {
      await fetch(`/api/devtools/connection?provider=${p}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (denied) return <div className="card p-6 text-sm text-[#5f5f5d]">Only admins can connect developer tools.</div>;
  if (!conns) return <div className="card p-6"><Loader2 className="w-4 h-4 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="card p-5 text-sm text-[#5f5f5d]">
        Connect your team&apos;s tools to show live pull requests, commits, deployments and project health on the home dashboard.
        Tokens are checked, stored server-side only, and never sent to anyone&apos;s browser. Use read-only tokens.
      </div>
      {TOOLS.map(t => {
        const c = conns.find(x => x.provider === t.key);
        const f = form[t.key];
        return (
          <div key={t.key} className="card p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <t.icon className="w-5 h-5 text-[#1c1c1c]" />
                <h3 className="text-sm font-bold text-[#1c1c1c]">{t.name}</h3>
                {c && <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> {c.config.label}</span>}
              </div>
              {c && <button onClick={() => disconnect(t.key)} disabled={busy === t.key} className="text-xs font-semibold text-rose-600 hover:underline">Disconnect</button>}
            </div>
            {c && (
              <p className="text-xs text-[#5f5f5d]">
                {t.key === "github" && `Repos: ${c.config.repos?.join(", ") || "none"}`}
                {t.key === "vercel" && `Team: ${c.config.teamId || "personal account"}`}
                {t.key === "supabase" && `Projects: ${c.config.projects?.join(", ") || "all"}`}
                {" · "}connected {new Date(c.connectedAt).toLocaleDateString()}
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold text-[#1c1c1c] space-y-1">
                <span>{c ? "Replace token" : "Access token"}</span>
                <input type="password" autoComplete="off" className="input w-full" value={f.token}
                  onChange={e => setForm(s => ({ ...s, [t.key]: { ...s[t.key], token: e.target.value } }))} />
              </label>
              <label className="text-xs font-semibold text-[#1c1c1c] space-y-1">
                <span>{t.extra}</span>
                <input className="input w-full" placeholder={t.extraHelp} value={f.extra}
                  onChange={e => setForm(s => ({ ...s, [t.key]: { ...s[t.key], extra: e.target.value } }))} />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#5f5f5d]">{t.tokenHelp} <a href={t.tokenUrl} target="_blank" rel="noreferrer" className="underline">Create token</a></p>
              <button onClick={() => connect(t.key)} disabled={!f.token || busy === t.key} className="btn-primary text-xs px-4 py-2 disabled:opacity-40">
                {busy === t.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : c ? "Update" : "Connect"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
