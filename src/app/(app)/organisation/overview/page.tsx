"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, BadgeCheck, Building2, CalendarDays, ChevronRight, FileText, Gauge, GitBranch, LayoutGrid, LayoutTemplate, Loader2, MapPin, Megaphone, Network, RefreshCw, Shield, SlidersHorizontal, Upload, UserPlus, Users, Zap } from "lucide-react";
import { AccessDenied, PageHeader, StatCard } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn, timeAgo } from "@/lib/utils";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { can } from "@/lib/access";
import { groupCounts, loadOrgOverview, unitTrend, type OrgOverview, type Unit } from "@/lib/org-overview";
import { StructureCard } from "@/components/organisation/overview/StructureCard";
import { WorkforceCard } from "@/components/organisation/overview/WorkforceCard";
import { SetupProgress } from "@/components/organisation/overview/SetupProgress";

const CARD_KEYS = ["total", "departments", "designations", "branches", "active", "leave", "joiners", "announcements"] as const;
type CardKey = (typeof CARD_KEYS)[number];
const HIDDEN_KEY = "org-overview-hidden-cards";

const ACTIONS = [
  { label: "Add employee", href: "/team", icon: UserPlus },
  { label: "Add department", href: "/organisation", icon: Network },
  { label: "Add designation", href: "/organisation", icon: BadgeCheck },
  { label: "Add branch", href: "/organisation", icon: Building2 },
];
const MORE_ACTIONS = [
  { label: "Manage roles", href: "/roles", icon: Shield },
  { label: "KPI plans", href: "/kpi", icon: Gauge },
  { label: "Announcement", href: "/hr?tab=announcements", icon: Megaphone },
  { label: "Import employees", href: "/hr?tab=employees", icon: Upload },
  { label: "All dashboards", href: "/dashboards", icon: LayoutGrid },
];
// Icon + tint per audit entity (the status-pill tints the app already uses).
const ENTITY: Record<string, { icon: typeof Users; cls: string }> = {
  profiles: { icon: UserPlus, cls: "bg-emerald-50 text-emerald-700" }, profile: { icon: UserPlus, cls: "bg-emerald-50 text-emerald-700" },
  departments: { icon: Network, cls: "bg-violet-50 text-violet-700" }, designations: { icon: BadgeCheck, cls: "bg-amber-50 text-amber-700" },
  branches: { icon: MapPin, cls: "bg-sky-50 text-sky-700" }, roles: { icon: Shield, cls: "bg-rose-50 text-rose-700" },
  holidays: { icon: CalendarDays, cls: "bg-sky-50 text-sky-700" }, hr_policies: { icon: FileText, cls: "bg-amber-50 text-amber-700" },
  kpi_plans: { icon: Gauge, cls: "bg-violet-50 text-violet-700" }, kpi_assignments: { icon: Gauge, cls: "bg-violet-50 text-violet-700" }, kpi_templates: { icon: Gauge, cls: "bg-violet-50 text-violet-700" },
};
/** Staggered entrance (globals.css .rise; off under reduced motion). */
const rise = (i: number, cls = "") => ({ className: cn("rise", cls), style: { animationDelay: `${i * 60}ms` } });
const link = "inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]";

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
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // Trend labels only from real history: creation dates or monthly head counts.
  const monthTrend = (added: number) => added > 0
    ? { trend: "up" as const, trendValue: `+${added} this month` }
    : added < 0 ? { trend: "down" as const, trendValue: `${added} this month` } : { trend: "neutral" as const, trendValue: "No change this month" };
  const unitCard = (l: Unit[]) => {
    const live = l.filter(u => u.is_active);
    const spark = unitTrend(live);
    return spark ? { sparklineData: spark, ...monthTrend(live.filter(u => new Date(u.created_at!) >= monthStart).length) } : {};
  };
  const ht = data?.headcountTrend ?? null;
  const joinTrend = s && s.with_joining_date > 0 && s.joined_prev_30d > 0
    ? { trend: (s.joined_30d >= s.joined_prev_30d ? "up" : "down") as "up" | "down", trendValue: `${s.joined_prev_30d} prev 30d` } : {};
  const ic = (I: typeof Users) => <I className="w-4 h-4" />;
  const cards: { key: CardKey; label: string; value: string | number; sub?: string; href: string; extra?: object }[] = data ? [
    { key: "total", label: "Total employees", value: n(s?.total), sub: "All registered", href: "/team",
      extra: { icon: ic(Users), ...(ht ? { sparklineData: ht.map(v => ({ value: v })), ...monthTrend(ht[ht.length - 1] - ht[ht.length - 2]) } : {}) } },
    { key: "departments", label: "Departments", value: act(data.departments), href: "/organisation", extra: { icon: ic(Network), ...unitCard(data.departments) } },
    { key: "designations", label: "Designations", value: act(data.designations), href: "/organisation", extra: { icon: ic(BadgeCheck), ...unitCard(data.designations) } },
    { key: "branches", label: "Branches", value: act(data.branches), href: "/organisation", extra: { icon: ic(MapPin), ...unitCard(data.branches) } },
    { key: "active", label: "Active employees", value: n(s?.active), sub: s ? `${s.total - s.active} inactive` : undefined, href: "/team", extra: { icon: ic(Activity) } },
    { key: "leave", label: "On leave today", value: n(data.counts.onLeave), sub: "Approved leave", href: "/hr?tab=attendance-reg", extra: { icon: ic(CalendarDays) } },
    { key: "joiners", label: "Joined in 30 days", value: s && s.with_joining_date > 0 ? s.joined_30d : "—", sub: s && s.with_joining_date === 0 ? "No joining dates recorded" : undefined, href: "/team", extra: { icon: ic(UserPlus), ...joinTrend } },
    { key: "announcements", label: "Announcements", value: n(data.counts.announcements), href: "/hr?tab=announcements", extra: { icon: ic(Megaphone) } },
  ] : [];

  const byDept = groupCounts(s, "department");
  const topDepts = (data?.departments ?? []).filter(d => d.is_active).sort((a, b) => (byDept.get(b.id) ?? 0) - (byDept.get(a.id) ?? 0));
  const manage = data ? [
    { label: "Branches & locations", desc: `${act(data.branches)} active`, href: "/organisation", icon: MapPin },
    { label: "Departments", desc: `${act(data.departments)} active`, href: "/organisation", icon: Network },
    { label: "Designations", desc: `${act(data.designations)} job titles`, href: "/organisation", icon: BadgeCheck },
    { label: "Employees", desc: s ? `${s.active} active` : "Add and onboard", href: "/team", icon: Users },
    { label: "Reporting hierarchy", desc: s ? `${s.with_manager} have a manager` : "Who reports to whom", href: "/organisation", icon: GitBranch },
    { label: "Roles & permissions", desc: data.counts.customRoles == null ? "Module access" : `${data.counts.customRoles} custom roles`, href: "/roles", icon: Shield },
    { label: "Holidays & leave", desc: data.counts.holidays == null ? "Calendar" : `${data.counts.holidays} holidays`, href: "/hr?tab=attendance-reg", icon: CalendarDays },
    { label: "Policies", desc: data.counts.policies == null ? "Company documents" : `${data.counts.policies} policies`, href: "/hr?tab=documents", icon: FileText },
    { label: "KPI plans", desc: data.counts.kpiPlans == null ? "Targets" : `${data.counts.kpiPlans} active`, href: "/kpi", icon: Gauge },
    { label: "Dashboards", desc: "Who sees which home", href: "/dashboards", icon: LayoutGrid },
  ] : [];

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        title="Organisation Management"
        subtitle="Your company's people, structure, access and setup in one place."
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
            {/* Hero: identity and headline counts */}
            <div {...rise(0, "relative overflow-hidden rounded-2xl bg-[#1c1c1c] text-white p-6 lg:col-span-2 flex flex-col justify-between gap-6 min-h-[180px]")}>
              <div aria-hidden className="absolute inset-y-0 right-0 w-1/2 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "16px 16px", maskImage: "linear-gradient(to left, black, transparent)", WebkitMaskImage: "linear-gradient(to left, black, transparent)" }} />
              <Building2 aria-hidden className="absolute -right-6 -bottom-8 w-48 h-48 text-white/[0.06]" />
              <div className="relative min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl lg:text-3xl font-black tracking-tight truncate">{data.org?.name ?? "Your organisation"}</h2>
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full", data.org?.is_active === false ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-300")}>{data.org?.is_active === false ? "Inactive" : "Active"}</span>
                </div>
                <div className="text-xs text-white/60 mt-1">{data.org?.plan ? `${data.org.plan} plan · ` : ""}since {data.org ? new Date(data.org.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</div>
              </div>
              <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-4">
                {([["Employees", n(s?.active), Users], ["Departments", act(data.departments), Network], ["Designations", act(data.designations), BadgeCheck], ["Branches", act(data.branches), MapPin]] as const).map(([l, v, Icon]) => (
                  <div key={l} className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"><Icon className="w-4 h-4" /></span>
                    <span><b className="text-xl leading-none">{v}</b><br /><span className="text-[11px] text-white/60">{l}</span></span>
                  </div>
                ))}
              </div>
            </div>
            <div {...rise(1, "card p-5")}>
              <div className="text-sm font-bold text-[#1c1c1c] mb-3 flex items-center gap-2"><Zap className="w-4 h-4" /> Quick actions</div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {ACTIONS.map(a => (
                  <Link key={a.label} href={a.href} className="flex flex-col items-start gap-2 text-xs font-semibold p-3 rounded-xl bg-[#f7f4ed] border border-[#eceae4] hover:border-[#1c1c1c]/20 hover:-translate-y-0.5 transition-all">
                    <a.icon className="w-4 h-4" /><span>+ {a.label}</span>
                  </Link>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MORE_ACTIONS.map(a => (
                  <Link key={a.label} href={a.href} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border border-[#eceae4] hover:bg-[#f7f4ed]">
                    <a.icon className="w-3 h-3" />{a.label}
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
            {cards.filter(c => !hidden.includes(c.key)).map((c, i) => (
              <div key={c.key} {...rise(i + 2, "h-full")}><StatCard label={c.label} value={c.value} sub={c.sub} href={c.href} {...c.extra} /></div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div {...rise(4, "h-full")}><StructureCard data={data} /></div>
            <div {...rise(5, "h-full")}><WorkforceCard data={data} /></div>
            <div {...rise(6, "card p-5 h-full")}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><Network className="w-4 h-4" /> Department overview</h3>
                <Link href="/organisation" className={link}>View all <ArrowRight className="w-3 h-3" /></Link>
              </div>
              {topDepts.length === 0 ? <p className="text-xs text-[#5f5f5d]">No departments yet.</p> : (
                <ul className="divide-y divide-[#eceae4]">
                  {topDepts.slice(0, 7).map(d => (
                    <li key={d.id}>
                      <Link href="/organisation" className="flex items-center gap-3 py-2 text-xs group">
                        <span className="w-8 h-8 rounded-lg bg-[#f7f4ed] border border-[#eceae4] flex items-center justify-center flex-shrink-0"><Network className="w-3.5 h-3.5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-[#1c1c1c] truncate">{d.name}</span>
                          <span className={cn("block text-[10px] truncate", d.head_id ? "text-[#5f5f5d]" : "text-amber-700")}>{d.head_id ? `Head: ${data.names[d.head_id] ?? "—"}` : "No head set"}</span>
                        </span>
                        <span className="font-bold text-[#1c1c1c]">{byDept.get(d.id) ?? 0}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#5f5f5d] transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div {...rise(7, "lg:col-span-2 h-full")}><SetupProgress data={data} /></div>
            <div {...rise(8, "card p-5 h-full lg:col-span-2")}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><Activity className="w-4 h-4" /> Recent activity</h3>
                <Link href="/admin-logs" className={link}>View all <ArrowRight className="w-3 h-3" /></Link>
              </div>
              {data.activity == null ? <p className="text-xs text-[#5f5f5d]">You don&apos;t have access to the audit log.</p>
              : data.activity.length === 0 ? <p className="text-xs text-[#5f5f5d]">No organisation changes recorded yet.</p>
              : (
                <ul className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {data.activity.map(a => {
                    const e = ENTITY[a.entity_type] ?? { icon: Activity, cls: "bg-[#f7f4ed] text-[#1c1c1c]" };
                    return (
                      <li key={a.id} className="text-xs flex gap-2.5 items-start">
                        <span className={cn("w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0", e.cls)}><e.icon className="w-3.5 h-3.5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-[#1c1c1c] truncate">{a.summary || a.action.replace(/_/g, " ")}</span>
                          <span className="block text-[10px] text-[#5f5f5d] truncate">{(a.actor_id && data.names[a.actor_id]) || a.actor_email || "System"}</span>
                        </span>
                        <span className="text-[10px] text-[#5f5f5d] whitespace-nowrap">{timeAgo(a.created_at)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div {...rise(9, "card p-5 h-full flex flex-col gap-3 bg-gradient-to-br from-white to-[#f7f4ed]")}>
              <span className="w-10 h-10 rounded-xl bg-[#1c1c1c] text-white flex items-center justify-center"><LayoutTemplate className="w-5 h-5" /></span>
              <div>
                <h3 className="text-sm font-bold text-[#1c1c1c]">Industry templates</h3>
                <p className="text-[11px] text-[#5f5f5d] mt-1">Suggested departments and designations for your type of business. You pick which to add.</p>
              </div>
              <Link href="/organisation?templates=1" className="mt-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white">Explore templates <ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
          </div>

          <div {...rise(10)}>
            <h3 className="text-sm font-bold text-[#1c1c1c] mb-3">Manage your organisation</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {manage.map(m => (
                <Link key={m.label} href={m.href} className="card p-4 flex flex-col items-center text-center gap-2 hover:-translate-y-0.5 hover:shadow-md transition-all">
                  <span className="w-10 h-10 rounded-xl bg-[#f7f4ed] border border-[#eceae4] flex items-center justify-center"><m.icon className="w-4 h-4" /></span>
                  <span className="text-xs font-bold text-[#1c1c1c]">{m.label}</span>
                  <span className="text-[10px] text-[#5f5f5d]">{m.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
