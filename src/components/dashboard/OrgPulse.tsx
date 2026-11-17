"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ListChecks, Network, Users } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { loadOrgOverview, type OrgOverview } from "@/lib/org-overview";
import { setupSteps } from "@/components/organisation/overview/SetupProgress";
import { Tile } from "./Tiles";

/** Organisation at a glance on the one Dashboard (org managers only; data via RLS). */
export function OrgPulse() {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<OrgOverview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadOrgOverview(supabase).then(x => { if (live) setD(x); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [supabase]);
  if (failed) return null;
  const s = d?.summary;
  const steps = d ? setupSteps(d).filter(x => x.done !== null) : [];
  const pct = steps.length ? (steps.filter(x => x.done).length / steps.length) * 100 : 0;
  const deps = d ? d.departments.filter(x => x.is_active).length : null;
  const dash = (v: number | null | undefined) => (d ? v ?? "—" : "·");
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-[#1c1c1c]">Your organisation</h2>
        <Link href="/organisation/overview" className="inline-flex items-center gap-1 text-xs font-semibold text-[#1c1c1c] hover:underline">Full organisation view <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={<Users className="w-4 h-4" />} label="Active employees" value={dash(s?.active)} sub={s ? `${s.total - s.active} inactive` : undefined} href="/team" />
        <Tile icon={<Network className="w-4 h-4" />} label="Departments" value={dash(deps)} sub={s ? `${s.with_department}/${s.active} people placed` : undefined} href="/organisation" tone="mint"
          ring={s && s.active > 0 ? { pct: (s.with_department / s.active) * 100, label: "placed" } : null} />
        <Tile icon={<CalendarDays className="w-4 h-4" />} label="On leave today" value={dash(d?.counts.onLeave)} sub="Approved leave" href="/hr?tab=attendance-reg" tone="amber" />
        <Tile icon={<ListChecks className="w-4 h-4" />} label="Setup" value={d ? `${steps.filter(x => x.done).length}/${steps.length}` : "·"} sub="Steps done" href="/organisation/overview" tone="lime"
          ring={d && steps.length ? { pct, label: "done" } : null} />
      </div>
    </section>
  );
}
