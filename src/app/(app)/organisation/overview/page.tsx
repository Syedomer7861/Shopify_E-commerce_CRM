"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, BadgeCheck, Building2, Gauge, LayoutGrid, Loader2, Megaphone, Network, Plus, RefreshCw, Shield, SlidersHorizontal, Upload, UserPlus, Users } from "lucide-react";
import { AccessDenied, PageHeader, StatCard } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn, timeAgo } from "@/lib/utils";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { can } from "@/lib/access";
import { groupCounts, loadOrgOverview, type OrgOverview } from "@/lib/org-overview";
import { StructureCard } from "@/components/organisation/overview/StructureCard";
import { WorkforceCard } from "@/components/organisation/overview/WorkforceCard";
import { SetupProgress } from "@/components/organisation/overview/SetupProgress";

const CARD_KEYS = ["total", "active", "departments", "designations", "branches", "leave", "joiners", "announcements"] as const;
type CardKey = (typeof CARD_KEYS)[number];
const HIDDEN_KEY = "org-overview-hidden-cards";

const ACTIONS = [
  { label: "Add employee", href: "/team", icon: UserPlus },
  { label: "Add department", href: "/organisation", icon: Network },
  { label: "Add designation", href: "/organisation", icon: BadgeCheck },
  { label: "Add branch", href: "/organisation", icon: Building2 },
  { label: "Manage roles", href: "/roles", icon: Shield },
  { label: "KPI plans", href: "/kpi", icon: Gauge },
  { label: "Announcement", href: "/hr?tab=announcements", icon: Megaphone },
  { label: "Import employees", href: "/hr?tab=employees", icon: Upload },
  { label: "All dashboards", href: "/dashboards", icon: LayoutGrid },
];

export default function OrganisationOverviewPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [data, setData] = useState<OrgOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [hidden, setHidden] = useState<CardKey[]>([]);
  const [customising, setCustomising] = useState(false);
  const canView = hasPermission(profile, "manage_team") || can(profile, "organisation", "view") !== null;

  useEffect(() => {
    try { setHidden(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]")); } catch { /* storage blocked: show all */ }
  }, []);
  useEffect(() => {
    if (profileLoading || !canView) return;
    let live = true;
    setError(null);
    loadOrgOverview(supabase).then(d => { if (live) setData(d); }).catch(e => { if (live) setError(String(e?.message ?? e)); });
    return () => { live = false; };
  }, [supabase, profileLoading, canView, tick]);

  if (profileLoading) return null;
  if (!canView) return <AccessDenied />;

  const toggle = (k: CardKey) => {
    const next = hidden.includes(k) ? hidden.filter(x => x !== k) : [...hidden, k];
    setHidden(next);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* per-viewer convenience only */ }
  };

  const s = data?.summary ?? null;
  const act = (l: { is_active: boolean }[]) => l.filter(x => x.is_active).length;
  const n = (v: number | null | undefined) => (v == null ? "—" : v);
  // Joiner comparison only when joining dates are actually recorded.
  const joinTrend = s && s.with_joining_date > 0 && s.joined_prev_30d > 0
    ? { trend: (s.joined_30d >= s.joined_prev_30d ? "up" : "down") as "up" | "down", trendValue: `${s.joined_prev_30d} prev 30d` } : {};
  const cards: { key: CardKey; label: string; value: string | number; sub?: string; href: string; extra?: object }[] = data ? [
    { key: "total", label: "Total employees", value: n(s?.total), sub: "All registered", href: "/team" },
    { key: "active", label: "Active employees", value: n(s?.active), sub: s ? `${s.total - s.active} inactive` : undefined, href: "/team" },
    { key: "departments", label: "Departments", value: act(data.departments), sub: `${data.departments.length - act(data.departments)} inactive`, href: "/organisation" },
    { key: "designations", label: "Designations", value: act(data.designations), href: "/organisation" },
    { key: "branches", label: "Branches", value: act(data.branches), href: "/organisation" },
    { key: "leave", label: "On leave today", value: n(data.counts.onLeave), sub: "Approved leave", href: "/hr?tab=attendance-reg" },
    { key: "joiners", label: "Joined in 30 days", value: s && s.with_joining_date > 0 ? s.joined_30d : "—", sub: s && s.with_joining_date === 0 ? "No joining dates recorded" : undefined, href: "/team", extra: joinTrend },
    { key: "announcements", label: "Announcements", value: n(data.counts.announcements), href: "/hr?tab=announcements" },
  ] : [];

  const byDept = groupCounts(s, "department");
  const depts = data?.departments ?? [];

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        title="Organisation"
        subtitle="Structure, people and setup for your whole organisation."
        actions={<>
          <button onClick={() => setCustomising(c => !c)} className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[#eceae4]", customising && "bg-[#1c1c1c] text-white")}><SlidersHorizontal className="w-3.5 h-3.5" /> Cards</button>
          <button onClick={() => { setData(null); setTick(t => t + 1); }} aria-label="Refresh" className="p-2 rounded-lg border border-[#eceae4]"><RefreshCw className="w-3.5 h-3.5" /></button>
        </>}
      />

      {error ? <div className="card p-6 text-sm text-rose-700">Couldn&apos;t load the organisation: {error}</div>
      : !data ? <div className="py-16 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2 flex flex-col justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#1c1c1c] text-white flex items-center justify-center"><Building2 className="w-5 h-5" /></div>
                <div className="min-w-0">
                  <div className="text-xl font-black tracking-tight text-[#1c1c1c] truncate">{data.org?.name ?? "Your organisation"}</div>
                  <div className="text-xs text-[#5f5f5d]">{data.org?.plan ? `${data.org.plan} plan · ` : ""}since {data.org ? new Date(data.org.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</div>
                </div>
                <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full", data.org?.is_active === false ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700")}>{data.org?.is_active === false ? "Inactive" : "Active"}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[["Employees", n(s?.active), Users], ["Departments", act(data.departments), Network], ["Designations", act(data.designations), BadgeCheck], ["Branches", act(data.branches), Building2]].map(([l, v, I]) => {
                  const Icon = I as typeof Users;
                  return <div key={l as string} className="flex items-center gap-2"><Icon className="w-4 h-4 text-[#5f5f5d]" /><span><b className="text-base text-[#1c1c1c]">{v as string}</b><br /><span className="text-[#5f5f5d]">{l as string}</span></span></div>;
                })}
              </div>
            </div>
            <div className="card p-5">
              <div className="text-xs font-bold text-[#1c1c1c] mb-3">Quick actions</div>
              <div className="grid grid-cols-2 gap-2">
                {ACTIONS.map(a => (
                  <Link key={a.label} href={a.href} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-2 rounded-lg border border-[#eceae4] hover:bg-[#f7f4ed]">
                    <a.icon className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{a.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {customising && (
            <div className="card p-4 flex flex-wrap gap-3 text-xs">
              {cards.map(c => <label key={c.key} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggle(c.key)} />{c.label}</label>)}
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.filter(c => !hidden.includes(c.key)).map(c => <StatCard key={c.key} label={c.label} value={c.value} sub={c.sub} href={c.href} {...c.extra} />)}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <StructureCard data={data} />
            <WorkforceCard data={data} />
            <div className="card p-5 h-full">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><Network className="w-4 h-4" /> Departments</h3>
                <Link href="/organisation" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]"><Plus className="w-3 h-3" /> Add</Link>
              </div>
              {depts.length === 0 ? <p className="text-xs text-[#5f5f5d]">No departments yet.</p> : (
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-[#5f5f5d]"><th className="pb-1">Name</th><th>Head</th><th className="text-right">People</th></tr></thead>
                  <tbody>
                    {[...depts].sort((a, b) => (byDept.get(b.id) ?? 0) - (byDept.get(a.id) ?? 0)).slice(0, 10).map(d => (
                      <tr key={d.id} className="border-t border-[#eceae4]">
                        <td className="py-1.5 font-semibold text-[#1c1c1c]">{d.name}{!d.is_active && <span className="ml-1 text-[10px] text-[#5f5f5d]">(inactive)</span>}</td>
                        <td className={d.head_id ? "" : "text-amber-700"}>{d.head_id ? data.names[d.head_id] ?? "—" : "Not set"}</td>
                        <td className="text-right">{byDept.get(d.id) ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SetupProgress data={data} />
            <div className="card p-5 h-full">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><Activity className="w-4 h-4" /> Recent organisation activity</h3>
                <Link href="/admin-logs" className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]">View all</Link>
              </div>
              {data.activity == null ? <p className="text-xs text-[#5f5f5d]">You don&apos;t have access to the audit log.</p>
              : data.activity.length === 0 ? <p className="text-xs text-[#5f5f5d]">No organisation changes recorded yet.</p>
              : (
                <ul className="space-y-2.5">
                  {data.activity.map(a => (
                    <li key={a.id} className="text-xs flex gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1c1c1c] mt-1.5 flex-shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-[#1c1c1c]">{(a.actor_id && data.names[a.actor_id]) || a.actor_email || "System"}</span>{" "}
                        <span className="text-[#5f5f5d]">{a.summary || a.action.replace(/_/g, " ")}</span>
                      </span>
                      <span className="text-[10px] text-[#5f5f5d] whitespace-nowrap">{timeAgo(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
