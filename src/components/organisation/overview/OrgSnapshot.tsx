"use client";
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { loadOrgOverview, type OrgOverview } from "@/lib/org-overview";

/** Dashboard widget: headline organisation counts (same sources as the Organisation dashboard). */
export function OrgSnapshot() {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<OrgOverview | null>(null);
  useEffect(() => { let live = true; loadOrgOverview(supabase).then(x => { if (live) setD(x); }).catch(() => {}); return () => { live = false; }; }, [supabase]);
  const act = (l: { is_active: boolean }[] = []) => l.filter(x => x.is_active).length;
  const v = (x: number | null | undefined) => (d ? x ?? "—" : "-");
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Active employees" value={v(d?.summary?.active)} href="/organisation/overview" />
      <StatCard label="Departments" value={d ? act(d.departments) : "-"} href="/organisation" />
      <StatCard label="On leave today" value={v(d?.counts.onLeave)} href="/hr?tab=attendance-reg" />
      <StatCard label="Joined in 30 days" value={d?.summary && d.summary.with_joining_date > 0 ? d.summary.joined_30d : "—"} href="/team" />
    </div>
  );
}
