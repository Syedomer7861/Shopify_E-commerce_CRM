"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { formatMinor } from "@/lib/money";
import { monthlyMinor, monthStart, movement, mrrAt, mrrSeries, type Sub } from "@/lib/revenue";

type Row = Sub & {
  id: string;
  organizations: { name: string } | null;
  plan_versions: { subscription_plans: { name: string } | null } | null;
};

const DAY = 86400000;
const day = (s: string) => new Date(s).toLocaleDateString();

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] text-[#5f5f5d]">{label}</div>
      <div className="text-xl font-bold text-[#1c1c1c] tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-[#5f5f5d] mt-1">{sub}</div>}
    </div>
  );
}

export default function SuperAdminRevenue() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    supabase.from("org_subscriptions")
      .select("id, org_id, status, billing_cycle, currency, price_minor, trial_ends_at, current_period_end, created_at, cancelled_at, organizations(name), plan_versions(subscription_plans(name))")
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRows((data || []) as unknown as Row[]);
      });
  }, [supabase]);

  const now = useMemo(() => new Date(), []);
  const view = useMemo(() => {
    if (!rows) return null;
    const mrr = mrrAt(rows, now);
    const moves = movement(rows, monthStart(now), now);
    const series = mrrSeries(rows, now, 12);
    const currencies = [...new Set([...Object.keys(mrr), ...Object.keys(moves), ...series.flatMap(s => Object.keys(s.mrr))])].sort();
    const current = rows.filter(r => r.status !== "cancelled");
    const byPlan = new Map<string, Record<string, number>>();
    for (const r of current) {
      if (r.trial_ends_at) continue;
      const name = r.plan_versions?.subscription_plans?.name || "Unknown plan";
      const m = byPlan.get(name) || {};
      byPlan.set(name, { ...m, [r.currency]: (m[r.currency] || 0) + monthlyMinor(r) });
    }
    const soon = (iso: string | null, days: number) => !!iso && new Date(iso).getTime() - now.getTime() <= days * DAY;
    return {
      mrr, moves, series, currencies, byPlan: [...byPlan.entries()],
      paying: current.filter(r => !r.trial_ends_at).length,
      trialsEnding: current.filter(r => r.status === "trialing" && soon(r.trial_ends_at, 14))
        .sort((a, b) => a.trial_ends_at!.localeCompare(b.trial_ends_at!)),
      renewals: current.filter(r => r.status === "active" && soon(r.current_period_end, 30))
        .sort((a, b) => a.current_period_end.localeCompare(b.current_period_end)),
    };
  }, [rows, now]);

  if (!view) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (rows!.length === 0) {
    return (
      <div>
        <PageHeader title="Revenue" subtitle="Contracted recurring revenue from the plans you assign." />
        <EmptyState icon={<Wallet className="w-6 h-6" />} title="No subscriptions yet" desc="Put an organisation on a plan from its page under Organisations." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue" subtitle="Contracted recurring revenue from the plans you assign: what organisations signed up for, not payments received. Trials count as nothing until converted." />

      {view.currencies.map(cur => {
        const m = view.moves[cur] || { start: 0, new: 0, expansion: 0, contraction: 0, churned: 0, end: 0 };
        const mrr = view.mrr[cur] || 0;
        const max = Math.max(1, ...view.series.map(s => s.mrr[cur] || 0));
        return (
          <section key={cur} className="space-y-3">
            <h2 className="text-sm font-bold text-[#1c1c1c]">{cur}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="MRR" value={formatMinor(mrr, cur)} sub="Yearly plans counted at a twelfth" />
              <Tile label="ARR" value={formatMinor(mrr * 12, cur)} sub="MRR × 12" />
              <Tile label="Net change this month" value={`${m.end >= m.start ? "+" : "−"}${formatMinor(Math.abs(m.end - m.start), cur)}`}
                sub={`New ${formatMinor(m.new, cur)} · Upgrades ${formatMinor(m.expansion, cur)} · Downgrades ${formatMinor(m.contraction, cur)}`} />
              <Tile label="Revenue churn this month" value={m.start ? `${((m.churned / m.start) * 100).toFixed(1)}%` : "—"}
                sub={`${formatMinor(m.churned, cur)} cancelled of ${formatMinor(m.start, cur)} at month start`} />
            </div>
            <div className="card p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-3">MRR at each month end</div>
              <div className="flex items-end gap-1.5 h-32" role="img" aria-label={`MRR in ${cur} over the last 12 months`}>
                {view.series.map(s => {
                  const v = s.mrr[cur] || 0;
                  return (
                    <div key={s.month} className="flex-1 flex flex-col items-center justify-end h-full" title={`${s.month}: ${formatMinor(v, cur)}`}>
                      <div className="w-full rounded-t bg-[#1c1c1c]" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0 }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1.5 mt-1">
                {view.series.map(s => <div key={s.month} className="flex-1 text-center text-[9px] text-[#5f5f5d]">{s.month.slice(5)}</div>)}
              </div>
            </div>
          </section>
        );
      })}

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-2">MRR by plan ({view.paying} paying)</div>
          {view.byPlan.length === 0 ? <p className="text-xs text-[#5f5f5d]">No paying organisations.</p> : view.byPlan.map(([name, m]) => (
            <div key={name} className="flex justify-between text-xs py-1">
              <span>{name}</span>
              <span className="tabular-nums font-semibold">{Object.entries(m).map(([c, v]) => formatMinor(v, c)).join(" + ")}</span>
            </div>
          ))}
        </div>
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-2">Trials ending in 14 days</div>
          {view.trialsEnding.length === 0 ? <p className="text-xs text-[#5f5f5d]">None.</p> : view.trialsEnding.map(r => (
            <Link key={r.id} href={`/superadmin/organisations/${r.org_id}`} className="flex justify-between text-xs py-1 hover:underline">
              <span>{r.organizations?.name || "Organisation"}</span>
              <span className={new Date(r.trial_ends_at!) < now ? "text-amber-700" : "text-[#5f5f5d]"}>{new Date(r.trial_ends_at!) < now ? "ended " : ""}{day(r.trial_ends_at!)}</span>
            </Link>
          ))}
        </div>
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-2">Renewals due in 30 days</div>
          {view.renewals.length === 0 ? <p className="text-xs text-[#5f5f5d]">None.</p> : view.renewals.map(r => (
            <Link key={r.id} href={`/superadmin/organisations/${r.org_id}`} className="flex justify-between text-xs py-1 hover:underline">
              <span>{r.organizations?.name || "Organisation"}</span>
              <span className="tabular-nums">{formatMinor(r.price_minor, r.currency)} · {day(r.current_period_end)}</span>
            </Link>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[#5f5f5d]">Customer lifetime value and acquisition cost aren&apos;t shown: they need collected payments (Razorpay, not connected yet) and a link from requests to the organisations created from them.</p>
    </div>
  );
}
