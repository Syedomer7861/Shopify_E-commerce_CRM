"use client";
import { useState } from "react";
import { PageHeader, AccessDenied } from "@/components/ui";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { can } from "@/lib/access";
import { RecordsModule, ModuleTabs, type RecordsConfig } from "./RecordsModule";

/**
 * A whole module page from config: one tab per table the viewer may see.
 * Used by Finance, Service Desk, Leads & Deals and Field Visits.
 */
export function ModulePage({ title, subtitle, tabs }: { title: string; subtitle: string; tabs: { label: string; config: RecordsConfig }[] }) {
  const { profile, loading } = useCurrentProfile();
  // ?tab=<table> opens that tab (global search links straight to it).
  const [active, setActive] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab"));

  if (loading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  const allowed = tabs.filter(t => can(profile, t.config.module, "view") !== null);
  if (!profile || allowed.length === 0) {
    return <AccessDenied title={title} desc="Your role doesn't include this module. An admin can grant it on the Roles page." />;
  }
  const current = allowed.find(t => t.config.table === active) || allowed[0];

  return (
    <div className="animate-fade-in">
      <PageHeader title={title} subtitle={subtitle} />
      <ModuleTabs tabs={allowed.map(t => ({ key: t.config.table, label: t.label }))} active={current.config.table} onChange={setActive} />
      <RecordsModule key={current.config.table} config={current.config} profile={profile} />
    </div>
  );
}
