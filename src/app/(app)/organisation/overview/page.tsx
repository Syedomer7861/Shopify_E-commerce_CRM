"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, ArrowUpRight, BadgeCheck, Building2, CalendarDays, ChevronRight, FileText, Gauge, GitBranch, LayoutGrid, LayoutTemplate, Loader2, MapPin, Megaphone, Network, RefreshCw, Shield, SlidersHorizontal, Upload, UserPlus, Users, Zap } from "lucide-react";
import { AccessDenied, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn, timeAgo } from "@/lib/utils";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { can } from "@/lib/access";
import { groupCounts, loadOrgOverview, unitTrend, type AuditRow, type OrgOverview, type Unit } from "@/lib/org-overview";
import { StructureCard } from "@/components/organisation/overview/StructureCard";
import { WorkforceCard } from "@/components/organisation/overview/WorkforceCard";
import { SetupProgress } from "@/components/organisation/overview/SetupProgress";
import { PANEL, Tile, type Tone } from "@/components/dashboard/Tiles";

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
  { label: "Home screens", href: "/dashboards", icon: LayoutGrid },
];
// Audit rows read "Insert kpi_plans Calling"; show them as plain sentences.
const ENTITY: Record<string, { icon: typeof Users; tone: Tone; noun: string }> = {
  profiles: { icon: UserPlus, tone: "mint", noun: "employee" }, profile: { icon: UserPlus, tone: "mint", noun: "employee" },
  departments: { icon: Network, tone: "lime", noun: "department" }, designations: { icon: BadgeCheck, tone: "amber", noun: "designation" },
  branches: { icon: MapPin, tone: "mint", noun: "branch" }, roles: { icon: Shield, tone: "coral", noun: "role" },
  holidays: { icon: CalendarDays, tone: "amber", noun: "holiday" }, hr_policies: { icon: FileText, tone: "amber", noun: "policy" },
  kpi_plans: { icon: Gauge, tone: "lime", noun: "KPI plan" }, kpi_assignments: { icon: Gauge, tone: "lime", noun: "KPI assignment" }, kpi_templates: { icon: Gauge, tone: "lime", noun: "KPI template" },
  settings: { icon: SlidersHorizontal, tone: "ink", noun: "settings" }, organizations: { icon: Building2, tone: "ink", noun: "organisation" },
};
const CHIP: Record<Tone, string> = { lime: "bg-[#e6f5a6] text-[#1c1c1c]", coral: "bg-[#fde3df] text-[#d6503f]", mint: "bg-[#dcf2e7] text-[#1f7a55]", amber: "bg-[#fdf0d2] text-[#b7791f]", ink: "bg-[#ecece8] text-[#1c1c1c]" };
const VERB: Record<string, string> = { insert: "Added", update: "Updated", delete: "Removed" };
function sentence(a: AuditRow) {
  const raw = a.summary || a.action.replace(/_/g, " ");
  const m = raw.match(/^(insert|update|delete)\s+(\S+)\s*(.*)$/i);
  if (!m) return raw;
  const noun = ENTITY[m[2]]?.noun ?? m[2].replace(/_/g, " ");
  return `${VERB[m[1].toLowerCase()]} ${noun}${m[3] ? `: ${m[3]}` : ""}`;
}
/** Staggered entrance (globals.css .rise; off under reduced motion). */
const rise = (i: number, cls = "") => ({ className: cn("rise", cls), style: { animationDelay: `${i * 60}ms` } });
const link = "inline-flex items-center gap-1 text-xs font-semibold text-[#1c1c1c] hover:underline";

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
  // Change labels only from real history: creation dates or monthly head counts.
  const change = (added: number) => ({ text: added > 0 ? `+${added} this month` : added < 0 ? `${added} this month` : "No change", dir: (added > 0 ? "up" : added < 0 ? "down" : "flat") as "up" | "down" | "flat" });
  const unitExtra = (l: Unit[]) => {
    const live = l.filter(u => u.is_active);
    const spark = unitTrend(live);
    return spark ? { spark: spark.map(p => p.value), trend: change(live.filter(u => new Date(u.created_at!) >= monthStart).length) } : {};
  };
  const ht = data?.headcountTrend ?? null;
  const ic = (I: typeof Users) => <I className="w-4 h-4" />;
  const cards: { key: CardKey; label: string; value: string | number; sub?: string; href: string; tone: Tone; icon: React.ReactNode; extra?: object }[] = data ? [
    { key: "total", label: "Total employees", value: n(s?.total), sub: "registered", href: "/team", tone: "lime", icon: ic(Users),
      extra: ht ? { spark: ht, trend: change(ht[ht.length - 1] - ht[ht.length - 2]) } : {} },
    { key: "departments", label: "Departments", value: act(data.departments), href: "/organisation", tone: "mint", icon: ic(Network), extra: unitExtra(data.departments) },
    { key: "designations", label: "Designations", value: act(data.designations), href: "/organisation", tone: "amber", icon: ic(BadgeCheck), extra: unitExtra(data.designations) },
    { key: "branches", label: "Branches", value: act(data.branches), href: "/organisation", tone: "mint", icon: ic(MapPin), extra: unitExtra(data.branches) },
    { key: "active", label: "Active employees", value: n(s?.active), sub: s ? `${s.total - s.active} inactive` : undefined, href: "/team", tone: "lime", icon: ic(Activity),
      extra: s && s.total > 0 ? { ring: { pct: (s.active / s.total) * 100, label: "active" } } : {} },
    { key: "leave", label: "On leave today", value: n(data.counts.onLeave), sub: "approved leave", href: "/hr?tab=attendance-reg", tone: "amber", icon: ic(CalendarDays) },
    { key: "joiners", label: "Joined in 30 days", value: s && s.with_joining_date > 0 ? s.joined_30d : "—", sub: s && s.with_joining_date === 0 ? "no joining dates recorded" : s && s.joined_prev_30d > 0 ? `${s.joined_prev_30d} the 30 days before` : undefined, href: "/team", tone: "mint", icon: ic(UserPlus) },
    { key: "announcements", label: "Announcements", value: n(data.counts.announcements), href: "/hr?tab=announcements", tone: "coral", icon: ic(Megaphone) },
  ] : [];

  const byDept = groupCounts(s, "department");
  const topDepts = (data?.departments ?? []).filter(d => d.is_active).sort((a, b) => (byDept.get(b.id) ?? 0) - (byDept.get(a.id) ?? 0));
  const manage = data ? [
    { label: "Branches & locations", desc: `${act(data.branches)} active`, href: "/organisation", icon: MapPin },
    { label: "Departments", desc: `${act(data.departments)} active`, href: "/organisation", icon: Network },
    { label: "Designations", desc: `${act(data.designations)} job titles`, href: "/organisation", icon: BadgeCheck },
    { label: "Employees", desc: s ? `${s.active} active` : "Add and onboard", href: "/team", icon: Users },
    { label: "Reporting lines", desc: s ? `${s.with_manager} have a manager` : "Who reports to whom", href: "/organisation", icon: GitBranch },
    { label: "Roles & permissions", desc: data.counts.customRoles == null ? "Module access" : `${data.counts.customRoles} custom roles`, href: "/roles", icon: Shield },
    { label: "Holidays & leave", desc: data.counts.holidays == null ? "Calendar" : `${data.counts.holidays} holidays`, href: "/hr?tab=attendance-reg", icon: CalendarDays },
    { label: "Policies", desc: data.counts.policies == null ? "Company documents" : `${data.counts.policies} policies`, href: "/hr?tab=documents", icon: FileText },
    { label: "KPI plans", desc: data.counts.kpiPlans == null ? "Targets" : `${data.counts.kpiPlans} active`, href: "/kpi", icon: Gauge },
    { label: "Home screens", desc: "Who sees which home", href: "/dashboards", icon: LayoutGrid },
  ] : [];

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        title="Organisation Management"
        subtitle="Your company's people, structure, access and setup in one place."
        actions={<>
          <button onClick={() => setCustomising(c => !c)} className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full border border-[#ebece6] bg-white", customising && "bg-[#1c1c1c] text-white")}><SlidersHorizontal className="w-3.5 h-3.5" /> Cards</button>
          <button onClick={() => { setData(null); setTick(t => t + 1); }} aria-label="Refresh" className="p-2 rounded-full border border-[#ebece6] bg-white"><RefreshCw className="w-3.5 h-3.5" /></button>
        </>}
      />

      {error ? <div className={cn(PANEL, "text-sm text-rose-700")}>Couldn&apos;t load the organisation: {error}</div>
      : !data ? <div className="py-16 text-center text-[#9a9a94]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      : (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Hero: identity and headline counts */}
            <div {...rise(0, "relative overflow-hidden rounded-[20px] bg-[#151515] text-white p-6 lg:col-span-2 flex flex-col justify-between gap-8 shadow-lg")}>
              <div aria-hidden className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-[#c3e33a]/20 blur-3xl" />
              <div aria-hidden className="absolute right-24 -bottom-24 w-56 h-56 rounded-full bg-[#c3e33a]/10 blur-3xl" />
              <div className="relative min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl lg:text-3xl font-bold tracking-tight truncate">{data.org?.name ?? "Your organisation"}</h2>
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md", data.org?.is_active === false ? "bg-rose-400 text-[#151515]" : "bg-[#d6ef6a] text-[#151515]")}>{data.org?.is_active === false ? "Inactive" : "Active"}</span>
                </div>
                <div className="text-xs text-white/55 mt-1.5 capitalize">{data.org?.plan ? `${data.org.plan} plan · ` : ""}since {data.org ? new Date(data.org.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</div>
              </div>
              <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([["Employees", n(s?.active), Users], ["Departments", act(data.departments), Network], ["Designations", act(data.designations), BadgeCheck], ["Branches", act(data.branches), MapPin]] as const).map(([l, v, Icon]) => (
                  <div key={l} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-2.5">
                    <span className="w-9 h-9 rounded-full bg-[#d6ef6a] text-[#151515] flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4" /></span>
                    <span className="min-w-0"><b className="block text-xl leading-none tabular-nums">{v}</b><span className="text-[11px] text-white/55">{l}</span></span>
                  </div>
                ))}
              </div>
            </div>
            <div {...rise(1, PANEL)}>
              <div className="text-sm font-bold text-[#1c1c1c] mb-3 flex items-center gap-2"><Zap className="w-4 h-4" /> Quick actions</div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {ACTIONS.map(a => (
                  <Link key={a.label} href={a.href} className="group flex items-center gap-2 text-xs font-semibold p-2.5 rounded-xl bg-[#f6f7f2] border border-[#ebece6] hover:border-[#c3e33a] hover:bg-[#f4f9df] transition-colors">
                    <span className="w-8 h-8 rounded-full bg-[#e6f5a6] flex items-center justify-center flex-shrink-0"><a.icon className="w-4 h-4" /></span>
                    <span className="truncate">{a.label}</span>
                  </Link>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MORE_ACTIONS.map(a => (
                  <Link key={a.label} href={a.href} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-[#ebece6] hover:bg-[#f6f7f2]">
                    <a.icon className="w-3 h-3" />{a.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {customising && (
            <div className={cn(PANEL, "flex flex-wrap gap-3 text-xs")}>
              {cards.map(c => <label key={c.key} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggle(c.key)} />{c.label}</label>)}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.filter(c => !hidden.includes(c.key)).map((c, i) => (
              <div key={c.key} {...rise(i + 2)}>
                <Tile icon={c.icon} label={c.label} value={c.value} sub={c.sub} href={c.href} tone={c.tone} className="h-full" {...c.extra} />
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div {...rise(4, "h-full")}><StructureCard data={data} /></div>
            <div {...rise(5, "h-full")}><WorkforceCard data={data} /></div>
            <div {...rise(6, cn(PANEL, "h-full"))}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><Network className="w-4 h-4" /> Department overview</h3>
                <Link href="/organisation" className={link}>View all <ArrowRight className="w-3.5 h-3.5" /></Link>
              </div>
              {topDepts.length === 0 ? <p className="text-xs text-[#6b6b67]">No departments yet.</p> : (
                <ul className="divide-y divide-[#f0f0ec]">
                  {topDepts.slice(0, 7).map(d => (
                    <li key={d.id}>
                      <Link href="/organisation" className="flex items-center gap-3 py-2 text-xs group">
                        <span className="w-8 h-8 rounded-full bg-[#dcf2e7] text-[#1f7a55] flex items-center justify-center flex-shrink-0"><Network className="w-3.5 h-3.5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-[#1c1c1c] truncate">{d.name}</span>
                          <span className={cn("block text-[10px] truncate", d.head_id ? "text-[#6b6b67]" : "text-amber-700")}>{d.head_id ? `Head: ${data.names[d.head_id] ?? "—"}` : "No head set"}</span>
                        </span>
                        <span className="font-bold text-[#1c1c1c] tabular-nums">{byDept.get(d.id) ?? 0}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#6b6b67] transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div {...rise(7, "h-full")}><SetupProgress data={data} /></div>
            <div {...rise(8, cn(PANEL, "h-full"))}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><Activity className="w-4 h-4" /> Recent activity</h3>
                <Link href="/admin-logs" className={link}>View all <ArrowRight className="w-3.5 h-3.5" /></Link>
              </div>
              {data.activity == null ? <p className="text-xs text-[#6b6b67]">You don&apos;t have access to the audit log.</p>
              : data.activity.length === 0 ? <p className="text-xs text-[#6b6b67]">No organisation changes recorded yet.</p>
              : (
                <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {data.activity.map(a => {
                    const e = ENTITY[a.entity_type] ?? { icon: Activity, tone: "ink" as Tone };
                    return (
                      <li key={a.id} className="text-xs flex gap-2.5 items-start">
                        <span className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", CHIP[e.tone])}><e.icon className="w-3.5 h-3.5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-[#1c1c1c] line-clamp-2">{sentence(a)}</span>
                          <span className="block text-[10px] text-[#6b6b67] truncate">{(a.actor_id && data.names[a.actor_id]) || a.actor_email || "System"} · {timeAgo(a.created_at)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div {...rise(9, "flex flex-col gap-4")}>
              <div className="relative overflow-hidden rounded-[20px] bg-[#151515] text-white p-5 flex-1 flex flex-col gap-3">
                <div aria-hidden className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-[#c3e33a]/20 blur-3xl" />
                <span className="relative w-10 h-10 rounded-full bg-[#d6ef6a] text-[#151515] flex items-center justify-center"><LayoutTemplate className="w-5 h-5" /></span>
                <div className="relative">
                  <h3 className="text-sm font-bold">Industry templates</h3>
                  <p className="text-[11px] text-white/60 mt-1">Suggested departments and designations for your type of business. You pick which to add.</p>
                </div>
                <Link href="/organisation?templates=1" className="relative mt-auto inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-[#d6ef6a] text-[#151515]">Explore templates <ArrowRight className="w-3.5 h-3.5" /></Link>
              </div>
            </div>
          </div>

          <div {...rise(10)}>
            <h3 className="text-sm font-bold text-[#1c1c1c] mb-3">Manage your organisation</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {manage.map(m => (
                <Link key={m.label} href={m.href} className="group bg-white rounded-[20px] border border-[#ebece6] p-4 flex items-center gap-3 hover:-translate-y-0.5 hover:shadow-md transition-all">
                  <span className="w-10 h-10 rounded-full bg-[#e6f5a6] flex items-center justify-center flex-shrink-0"><m.icon className="w-4 h-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-[#1c1c1c] truncate">{m.label}</span>
                    <span className="block text-[10px] text-[#6b6b67] truncate">{m.desc}</span>
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#6b6b67] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
