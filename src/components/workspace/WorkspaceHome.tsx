"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ALL_TIME, DateRangeFilter, applyDateRange, rangeLabel, type DateRange } from "@/components/DateRangeFilter";
import Link from "next/link";
import { Sun, Moon } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";
import { can } from "@/lib/access";
import { allowedNavModules } from "@/lib/permissions";
import { visibleModules } from "@/lib/modules";
import { AssignedTasksPanel } from "@/components/dashboard/AssignedTasksPanel";
import { OrdersSummary } from "@/components/dashboard/OrdersSummary";
import { ApprovalsInbox } from "./ApprovalsInbox";
import { MyWorkOverview } from "./MyWorkOverview";
import { DevToolsFeed } from "./DevToolsFeed";
import { hasPermission } from "@/lib/permissions";
import AnnouncementFeed from "@/components/AnnouncementFeed";
import { KpiScorecard } from "@/components/kpi/KpiScorecard";
import { OrgSnapshot } from "@/components/organisation/overview/OrgSnapshot";
import { FieldOverview, SalesOverview, FinanceOverview, ServiceDeskOverview } from "@/components/records/DeptOverviews";
import { FieldCommand } from "@/components/field/FieldCommand";

/** Live counts for the modules this person can open. RLS scopes every number to what they may see. */
function Pulse({ profile, range }: { profile: Profile; range: DateRange }) {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const cards = [
    { key: "tickets", perm: "tickets", label: "Open tickets", newLabel: "Tickets raised", href: "/service-desk", filter: ["open", "in_progress", "waiting"] },
    { key: "leads", perm: "leads", label: "Active leads", newLabel: "New leads", href: "/leads", filter: ["new", "contacted", "qualified"] },
    { key: "deals", perm: "deals", label: "Open deals", newLabel: "New deals", href: "/leads", filter: ["open", "proposal", "negotiation"] },
    // expenses.status is capitalised in the live schema.
    { key: "expenses", perm: "expenses", label: "Claims pending", newLabel: "Claims filed", href: "/finance", filter: ["Pending", "pending"] },
    { key: "visits", perm: "visits", label: "Visits planned", newLabel: "Visits logged", href: "/field", filter: ["planned"] },
  ].filter(c => can(profile, c.perm, "view") !== null);
  const keys = cards.map(c => c.key).join();
  const dated = Boolean(range.from || range.to);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    Promise.all(cards.map(c => {
      const q = supabase.from(c.key).select("id", { count: "exact", head: true });
      return dated ? applyDateRange(q, "created_at", range) : q.in("status", c.filter);
    }))
      .then(results => { if (active) setCounts(Object.fromEntries(cards.map((c, i) => [c.key, results[i].error ? null : results[i].count ?? 0]))); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, range.from, range.to]);

  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map(c => (
        <Link key={c.key} href={c.href}><StatCard label={dated ? `${c.newLabel}` : c.label} sub={dated ? rangeLabel(range) : undefined} value={counts[c.key] === undefined ? "-" : counts[c.key] ?? "—"} /></Link>
      ))}
    </div>
  );
}

/**
 * Widget registry for the home screen. A role's layout is roles.home_widgets
 * (set on the Roles page); null means "everything this role is allowed".
 * Adding a widget = one entry here.
 */
export type HomeWidget = {
  key: string; label: string; category: string; description: string;
  allowed: (p: Profile) => boolean; wide?: boolean; title?: string; href?: string;
  /** Only offered in the dashboard builder; never added to a role's "everything" default. */
  builderOnly?: boolean;
  render: (p: Profile, range: DateRange) => ReactNode;
};
export const HOME_WIDGETS: HomeWidget[] = [
  // Own Workspace tasks, projects, deadlines and logged hours. Shown to anyone in a Space (or a workspace admin).
  { key: "my-work", label: "My work overview", category: "Tasks & productivity", description: "Own Workspace tasks, projects, deadlines and hours.", wide: true, allowed: () => true, render: (p, r) => <MyWorkOverview profile={p} range={r} /> },
  // Live GitHub / Vercel / Supabase data once an admin connects them (Settings > Developer Tools). Renders nothing otherwise.
  { key: "dev-tools", label: "Developer live feed", category: "Technology", description: "GitHub, Vercel and Supabase activity once connected in Settings.", wide: true, allowed: () => true, render: () => <DevToolsFeed /> },
  { key: "pulse", label: "Module counts", category: "Analytics", description: "Open tickets, leads, deals, claims and visits the viewer can see.", wide: true, allowed: p => visibleModules(p).length > 0, render: (p, r) => <Pulse profile={p} range={r} /> },
  {
    key: "orders", label: "Orders & revenue", category: "Sales & CRM", description: "Orders and revenue for the selected period.", wide: true,
    // Keyed off the page allowlist, like the dashboard it replaced, so it works before the permission engine is installed.
    allowed: p => { const nav = allowedNavModules(p); return !nav || nav.includes("orders"); },
    render: (_p, r) => <OrdersSummary range={r} />,
  },
  { key: "assigned-tasks", label: "Tasks assigned to me", category: "Tasks & productivity", description: "Tasks other people assigned to the viewer.", title: "Assigned to me", href: "/my-hub?tab=assigned", allowed: () => true, render: p => <AssignedTasksPanel userId={p.id} compact /> },
  { key: "kpi-scorecard", label: "My KPI score", category: "Analytics", description: "The viewer's active KPI plan and score. Hidden when no plan is assigned.", wide: true, builderOnly: true, allowed: () => true, render: p => <KpiScorecard employeeId={p.id} viewer={p} /> },
  { key: "announcements", label: "Announcements", category: "Organisation", description: "Organisation announcements and bulletins.", wide: true, builderOnly: true, allowed: () => true, render: () => <AnnouncementFeed /> },
  { key: "org-snapshot", label: "Organisation snapshot", category: "Organisation", description: "Active employees, departments, leave today, new joiners. Admins and organisation viewers only.", wide: true, builderOnly: true,
    allowed: p => hasPermission(p, "manage_team") || can(p, "organisation", "view") !== null, render: () => <OrgSnapshot /> },
  // Department overviews and the field map. Builder only, so no role's default home changes.
  { key: "field-command", label: "Field command map", category: "Field team", description: "Live map of check-ins, reps' routes, visits that need attention and photo proof.", wide: true, builderOnly: true,
    allowed: p => can(p, "visits", "view") !== null, render: () => <FieldCommand className="" /> },
  { key: "field-overview", label: "Field visits overview", category: "Field team", description: "Visits today, missed, completed and check-ins per day.", wide: true, builderOnly: true,
    allowed: p => can(p, "visits", "view") !== null, render: () => <FieldOverview /> },
  { key: "sales-overview", label: "Sales pipeline overview", category: "Sales & CRM", description: "Lead funnel, deal values and conversion.", wide: true, builderOnly: true,
    allowed: p => can(p, "leads", "view") !== null || can(p, "deals", "view") !== null, render: () => <SalesOverview /> },
  { key: "finance-overview", label: "Finance overview", category: "Finance", description: "Claims, invoices due and overdue, spend by category.", wide: true, builderOnly: true,
    allowed: p => can(p, "expenses", "view") !== null || can(p, "invoices", "view") !== null, render: () => <FinanceOverview /> },
  { key: "support-overview", label: "Service desk overview", category: "Support", description: "Open tickets, SLA breaches and resolution times.", wide: true, builderOnly: true,
    allowed: p => can(p, "tickets", "view") !== null, render: () => <ServiceDeskOverview /> },
  { key: "approvals", label: "Approvals waiting on me", category: "Tasks & productivity", description: "Requests waiting for the viewer's decision.", title: "Waiting on you", href: "/approvals", allowed: p => visibleModules(p).some(m => m.key === "approvals"), render: p => <ApprovalsInbox profile={p} compact /> },
];

/** One widget on a dashboard. size: s=1/3, m=1/2, l=2/3, full row (desktop); one column below lg. */
export type WidgetSize = "s" | "m" | "l" | "full";
export type LayoutItem = { id: string; widget: string; size: WidgetSize; title?: string };
export const WIDGET_SIZES: { value: WidgetSize; label: string; cls: string }[] = [
  { value: "s", label: "Third", cls: "lg:col-span-2" },
  { value: "m", label: "Half", cls: "lg:col-span-3" },
  { value: "l", label: "Two thirds", cls: "lg:col-span-4" },
  { value: "full", label: "Full width", cls: "lg:col-span-6" },
];
export const WIDGET_BY_KEY = new Map(HOME_WIDGETS.map(w => [w.key, w]));

/**
 * Renders a layout for one viewer. A widget the viewer may not use (allowed()
 * false) or that no longer exists is skipped, so a dashboard never shows more
 * than the viewer's own permissions; the data inside still comes through RLS.
 */
export function DashboardGrid({ profile, range, items }: { profile: Profile; range: DateRange; items: LayoutItem[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
      {items.map(it => {
        const w = WIDGET_BY_KEY.get(it.widget);
        if (!w || !w.allowed(profile)) return null;
        const size = WIDGET_SIZES.find(x => x.value === it.size)?.cls ?? "lg:col-span-3";
        const title = it.title || w.title;
        return (
          <section key={it.id} className={cn(size, !w.wide && "card p-5")}>
            {title && (
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[#1c1c1c]">{title}</h3>
                {w.href && <Link href={w.href} className="text-[10px] font-bold uppercase tracking-wider text-[#5f5f5d] hover:text-[#1c1c1c]">View all</Link>}
              </div>
            )}
            {w.render(profile, range)}
          </section>
        );
      })}
    </div>
  );
}

/** Home for every role that doesn't work the call queue. Replaces the one-off finance dashboard. */
export function WorkspaceHome({ profile }: { profile: Profile }) {
  const hour = new Date().getHours();
  const Icon = hour < 17 ? Sun : Moon;
  const roleLayout = profile.role_home_widgets;
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  // undefined = still resolving; null = nothing assigned (or dashboards not installed).
  const [assigned, setAssigned] = useState<LayoutItem[] | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    createClient().rpc("my_dashboard").then(({ data, error }) => {
      const row = !error && Array.isArray(data) ? data[0] : null;
      if (live) setAssigned(row?.layout ?? null);
    });
    return () => { live = false; };
  }, []);
  const items: LayoutItem[] = assigned ?? HOME_WIDGETS
    .filter(w => !w.builderOnly && (!roleLayout || roleLayout.includes(w.key)))
    .map(w => ({ id: w.key, widget: w.key, size: w.wide ? "full" : "m" }));

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        title={<div className="flex items-center gap-3"><Icon className="w-7 h-7 text-[#1c1c1c]" /><span>{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, {profile.name?.split(" ")[0]}</span></div>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2 mt-1">
            {profile.designation && <span className="px-2.5 py-1 rounded-full bg-[#ecf8f1] text-[#24704c] text-xs font-semibold">{profile.designation}</span>}
            {profile.department && <span className="px-2.5 py-1 rounded-full bg-[#ebece6] text-[#1c1c1c] text-xs font-medium">{profile.department}</span>}
            <span className="px-2.5 py-1 rounded-full border border-[#ebece6] text-xs text-[#5f5f5d]">
              {new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </span>
          </span>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#9a9a94]">Showing: {rangeLabel(range)}</span>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>
      {assigned !== undefined && <DashboardGrid profile={profile} range={range} items={items} />}
    </div>
  );
}
