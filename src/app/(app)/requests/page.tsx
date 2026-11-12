"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LifeBuoy, IndianRupee, MapPin, Target, Megaphone, Blocks, ChevronRight, Loader2, type LucideIcon } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { can } from "@/lib/access";
import { allowedNavModules } from "@/lib/permissions";
import type { CustomModule } from "@/lib/app-templates";

type Item = { key: string; title: string; desc: string; href: string; icon: LucideIcon };

/**
 * One front door: everything a member can ask for or log, whichever module
 * handles it. Each card opens that module with its form already open
 * (`?new=1`, read by RecordsModule). Built-in entries follow the member's
 * permissions; the organisation's own apps are added from custom_modules.
 */
export default function RequestsPage() {
  const { profile, loading } = useCurrentProfile();
  const [apps, setApps] = useState<CustomModule[] | null>(null);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    // A database without migration 20261113a simply has no apps to list.
    createClient().from("custom_modules").select("*").eq("is_active", true).order("label")
      .then(({ data }) => { if (active) setApps((data as CustomModule[]) || []); });
    return () => { active = false; };
  }, [profile]);

  if (loading || (profile && apps === null)) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (!profile) return null;

  const nav = allowedNavModules(profile);
  const builtIn: (Item & { show: boolean })[] = [
    { key: "ticket", title: "Get help", desc: "IT, HR, finance or facilities: raise a ticket and track it to resolution.", href: "/service-desk?new=1", icon: LifeBuoy, show: can(profile, "tickets", "create") !== null },
    { key: "expense", title: "Claim an expense", desc: "Submit a claim; it goes to your manager for approval.", href: "/finance?new=1", icon: IndianRupee, show: can(profile, "expenses", "create") !== null },
    { key: "visit", title: "Log a field visit", desc: "Plan a visit or check in on site with photo and location.", href: "/field?new=1", icon: MapPin, show: can(profile, "visits", "create") !== null },
    { key: "lead", title: "Add a lead", desc: "Record a new prospect in your pipeline.", href: "/leads?new=1", icon: Target, show: can(profile, "leads", "create") !== null },
    { key: "creative", title: "Request creative work", desc: "Ask the marketing team for a design, video or copy.", href: "/workspace/request", icon: Megaphone, show: !nav || nav.includes("request-creative") },
  ];
  const items: Item[] = [
    ...builtIn.filter(i => i.show),
    ...(apps || []).map(a => ({ key: a.id, title: `New ${a.noun}`, desc: a.description || a.label, href: `/apps?app=${encodeURIComponent(a.key)}&new=1`, icon: Blocks })),
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Requests" subtitle="Everything you can ask for or log, in one place. Pick one and the form opens." />
      {items.length === 0 ? (
        <EmptyState icon={<LifeBuoy className="w-6 h-6" />} title="Nothing to request yet" desc="An admin can grant modules on the Roles page or build one under Apps." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(({ key, title, desc, href, icon: Icon }) => (
            <Link key={key} href={href} className="card p-4 flex items-start gap-3 hover:border-[#1c1c1c]/30 transition-colors">
              <span className="w-9 h-9 rounded-lg bg-white border border-[#eceae4] flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-[#1c1c1c]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[#1c1c1c]">{title}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">{desc}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300 mt-1 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
