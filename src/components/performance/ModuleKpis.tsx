"use client";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, Headphones, Receipt, MapPin, Target } from "lucide-react";
import { StatCard } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import type { Grants } from "@/lib/access";

/**
 * Department KPIs built from the records a person owns or works, picked by
 * their role's data grants (Roles page), not by department name: a role with
 * the deals grant gets sales numbers, one with tickets edit gets support
 * numbers, and so on. A custom role works the same way. A section also shows
 * when the person simply has records of that kind in the period. Every query
 * runs as the viewer, so RLS decides what may be counted.
 */
type Kpi = { label: string; value: string | number; sub?: string };
type Section = { key: string; title: string; icon: typeof Target; kpis: Kpi[]; rows: number };

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const works = (g: Grants | undefined, m: string) => {
  const a = g?.[m];
  return Boolean(a && (a.edit || a.approve || a.manage || a.assign));
};

async function rowsOf(q: PromiseLike<{ data: any[] | null; error: unknown }>): Promise<any[] | null> {
  try { const { data, error } = await q; return error ? null : data ?? []; } catch { return null; }
}

export function ModuleKpis({ userId, range, grants, isAdminRole }: {
  userId: string; range: { start: string; end: string }; grants?: Grants; isAdminRole?: boolean;
}) {
  const [sections, setSections] = useState<Section[] | null>(null);
  const has = useMemo(() => (m: string) => isAdminRole || Boolean(grants?.[m]?.view), [grants, isAdminRole]);
  const grantKey = JSON.stringify(grants ?? {});

  useEffect(() => {
    let alive = true;
    const sb = createClient();
    const inRange = (q: any, col = "created_at") => q.gte(col, range.start).lte(col, range.end).limit(5000);
    const jobs: Promise<Section | null>[] = [];

    if (has("leads") || has("deals")) jobs.push((async () => {
      const [leads, deals, pipeline] = await Promise.all([
        has("leads") ? rowsOf(inRange(sb.from("leads").select("status, est_value").eq("owner_id", userId))) : null,
        has("deals") ? rowsOf(inRange(sb.from("deals").select("status, value").eq("owner_id", userId))) : null,
        has("deals") ? rowsOf(sb.from("deals").select("value").eq("owner_id", userId).in("status", ["open", "proposal", "negotiation"]).limit(5000)) : null,
      ]);
      if (!leads && !deals) return null;
      const won = (deals ?? []).filter(d => d.status === "won");
      const closed = (deals ?? []).filter(d => d.status === "won" || d.status === "lost");
      const converted = (leads ?? []).filter(l => l.status === "converted");
      const kpis: Kpi[] = [];
      if (leads) kpis.push({ label: "Leads added", value: leads.length }, { label: "Leads converted", value: converted.length, sub: `${pct(converted.length, leads.length)} conversion` });
      if (deals) kpis.push({ label: "Deals won", value: won.length, sub: `${pct(won.length, closed.length)} win rate` }, { label: "Revenue won", value: money(sum(won, "value")) }, { label: "Open pipeline", value: money(sum(pipeline ?? [], "value")), sub: "All open deals" });
      return { key: "sales", title: "Sales", icon: Briefcase, kpis, rows: (leads?.length ?? 0) + (deals?.length ?? 0) + (works(grants, "deals") || works(grants, "leads") ? 1 : 0) };
    })());

    if (has("tickets")) jobs.push((async () => {
      const t = await rowsOf(inRange(sb.from("tickets").select("status, created_at, resolved_at, sla_breached_at").eq("assignee_id", userId)));
      if (!t) return null;
      const resolved = t.filter(x => x.resolved_at || x.status === "resolved" || x.status === "closed");
      const hrs = resolved.filter(x => x.resolved_at).map(x => (new Date(x.resolved_at).getTime() - new Date(x.created_at).getTime()) / 3_600_000);
      return {
        key: "support", title: "Support", icon: Headphones, rows: t.length + (works(grants, "tickets") ? 1 : 0),
        kpis: [
          { label: "Tickets assigned", value: t.length },
          { label: "Tickets resolved", value: resolved.length, sub: `${pct(resolved.length, t.length)} resolution rate` },
          { label: "Avg. resolution", value: hrs.length ? `${(hrs.reduce((a, b) => a + b, 0) / hrs.length).toFixed(1)}h` : "—" },
          { label: "SLA breaches", value: t.filter(x => x.sla_breached_at).length },
        ],
      };
    })());

    if (has("invoices")) jobs.push((async () => {
      const inv = await rowsOf(inRange(sb.from("invoices").select("status, amount").eq("created_by", userId)));
      if (!inv) return null;
      const paid = inv.filter(i => i.status === "paid");
      const due = inv.filter(i => i.status === "sent" || i.status === "overdue");
      return {
        key: "finance", title: "Finance", icon: Receipt, rows: inv.length + (works(grants, "invoices") ? 1 : 0),
        kpis: [
          { label: "Invoices processed", value: inv.length, sub: money(sum(inv, "amount")) },
          { label: "Payments received", value: paid.length, sub: money(sum(paid, "amount")) },
          { label: "Outstanding", value: money(sum(due, "amount")), sub: `${due.length} unpaid` },
          { label: "Overdue", value: inv.filter(i => i.status === "overdue").length },
        ],
      };
    })());

    if (has("visits")) jobs.push((async () => {
      const v = await rowsOf(inRange(sb.from("visits").select("status, check_out_at").eq("owner_id", userId), "planned_at"));
      if (!v) return null;
      const done = v.filter(x => x.check_out_at || x.status === "completed");
      return {
        key: "field", title: "Field visits", icon: MapPin, rows: v.length + (works(grants, "visits") ? 1 : 0),
        kpis: [
          { label: "Visits planned", value: v.length },
          { label: "Visits completed", value: done.length, sub: `${pct(done.length, v.length)} completion` },
        ],
      };
    })());

    Promise.all(jobs).then(r => { if (alive) setSections(r.filter((s): s is Section => Boolean(s && s.rows > 0))); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, range.start, range.end, grantKey, isAdminRole]);

  if (!sections || sections.length === 0) return null;
  return (
    <div className="space-y-4 mb-6">
      {sections.map(s => (
        <div key={s.key}>
          <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest mb-2 flex items-center gap-1.5"><s.icon className="w-3.5 h-3.5" /> {s.title}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {s.kpis.map(k => <StatCard key={k.label} label={k.label} value={k.value} sub={k.sub} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
