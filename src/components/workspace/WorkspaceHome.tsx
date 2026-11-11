"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Sun, Moon } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/types";
import { can } from "@/lib/access";
import { allowedNavModules } from "@/lib/permissions";
import { visibleModules } from "@/lib/modules";
import { AssignedTasksPanel } from "@/components/dashboard/AssignedTasksPanel";
import { OrdersSummary } from "@/components/dashboard/OrdersSummary";
import { ApprovalsInbox } from "./ApprovalsInbox";

/** Live counts for the modules this person can open. RLS scopes every number to what they may see. */
function Pulse({ profile }: { profile: Profile }) {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const cards = [
    { key: "tickets", perm: "tickets", label: "Open tickets", href: "/service-desk", filter: ["open", "in_progress", "waiting"] },
    { key: "leads", perm: "leads", label: "Active leads", href: "/leads", filter: ["new", "contacted", "qualified"] },
    { key: "deals", perm: "deals", label: "Open deals", href: "/leads", filter: ["open", "proposal", "negotiation"] },
    // expenses.status is capitalised in the live schema.
    { key: "expenses", perm: "expenses", label: "Claims pending", href: "/finance", filter: ["Pending", "pending"] },
    { key: "visits", perm: "visits", label: "Visits planned", href: "/field", filter: ["planned"] },
  ].filter(c => can(profile, c.perm, "view") !== null);
  const keys = cards.map(c => c.key).join();

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    Promise.all(cards.map(c => supabase.from(c.key).select("id", { count: "exact", head: true }).in("status", c.filter)))
      .then(results => { if (active) setCounts(Object.fromEntries(cards.map((c, i) => [c.key, results[i].error ? null : results[i].count ?? 0]))); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map(c => (
        <Link key={c.key} href={c.href}><StatCard label={c.label} value={counts[c.key] === undefined ? "-" : counts[c.key] ?? "—"} /></Link>
      ))}
    </div>
  );
}

/**
 * Widget registry for the home screen. A role's layout is roles.home_widgets
 * (set on the Roles page); null means "everything this role is allowed".
 * Adding a widget = one entry here.
 */
export const HOME_WIDGETS: { key: string; label: string; allowed: (p: Profile) => boolean; wide?: boolean; title?: string; href?: string; render: (p: Profile) => ReactNode }[] = [
  { key: "pulse", label: "Module counts", wide: true, allowed: p => visibleModules(p).length > 0, render: p => <Pulse profile={p} /> },
  {
    key: "orders", label: "Orders & revenue", wide: true,
    // Keyed off the page allowlist, like the dashboard it replaced, so it works before the permission engine is installed.
    allowed: p => { const nav = allowedNavModules(p); return !nav || nav.includes("orders"); },
    render: () => <OrdersSummary />,
  },
  { key: "assigned-tasks", label: "Tasks assigned to me", title: "Assigned to me", href: "/my-hub?tab=assigned", allowed: () => true, render: p => <AssignedTasksPanel userId={p.id} compact /> },
  { key: "approvals", label: "Approvals waiting on me", title: "Waiting on you", href: "/approvals", allowed: p => visibleModules(p).some(m => m.key === "approvals"), render: p => <ApprovalsInbox profile={p} compact /> },
];

/** Home for every role that doesn't work the call queue. Replaces the one-off finance dashboard. */
export function WorkspaceHome({ profile }: { profile: Profile }) {
  const hour = new Date().getHours();
  const Icon = hour < 17 ? Sun : Moon;
  const layout = profile.role_home_widgets;
  const widgets = HOME_WIDGETS.filter(w => w.allowed(profile) && (!layout || layout.includes(w.key)));

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        title={<div className="flex items-center gap-3"><Icon className="w-7 h-7 text-[#1c1c1c]" /><span>{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, {profile.name?.split(" ")[0]}</span></div>}
        subtitle={[profile.designation, profile.department].filter(Boolean).join(" · ") || "Your workspace"}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {widgets.map(w => (
          <section key={w.key} className={w.wide ? "lg:col-span-2" : "card p-5"}>
            {w.title && (
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[#1c1c1c]">{w.title}</h3>
                {w.href && <Link href={w.href} className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]">View all</Link>}
              </div>
            )}
            {w.render(profile)}
          </section>
        ))}
      </div>
    </div>
  );
}
