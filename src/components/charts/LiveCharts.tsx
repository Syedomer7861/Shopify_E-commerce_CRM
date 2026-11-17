"use client";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { BarChart3, PieChart as PieIcon, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { cn, SEGMENT_CONFIG } from "@/lib/utils";
import { PANEL } from "@/components/dashboard/Tiles";
import type { CustomerSegment } from "@/types";

/**
 * Live charts for list pages. Every number is a head-only count query
 * (no rows downloaded, RLS applies), so a chart never shows more than the
 * viewer could see in the list itself.
 */
type Count = { count: number | null; error: unknown };
const day = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const short = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** One count per bucket; null when any bucket was refused, so we never chart partial data. */
async function bucketCounts(edges: Date[], count: (from: string, to: string) => PromiseLike<Count>) {
  const res = await Promise.all(edges.slice(0, -1).map((e, i) => count(e.toISOString(), edges[i + 1].toISOString())));
  return res.some(r => r.error || r.count == null) ? null : res.map(r => r.count as number);
}

const tip = { fontSize: 11, borderRadius: 12, border: "1px solid #ebece6", boxShadow: "0 4px 16px rgba(16,24,16,0.08)" };
const Empty = ({ text }: { text: string }) => <p className="text-xs text-[#6b6b67] py-10 text-center">{text}</p>;
const Head = ({ icon: I, title, note }: { icon: typeof Users; title: string; note?: string }) => (
  <div className="flex items-center justify-between gap-2 mb-3">
    <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-[color:var(--accent-3)] flex items-center justify-center"><I className="w-3.5 h-3.5" /></span>{title}</h3>
    {note && <span className="text-[10px] font-semibold text-[#6b6b67] whitespace-nowrap">{note}</span>}
  </div>
);

export function OrdersInsights({ stats, loading }: { stats: Record<"delivered" | "in_transit" | "out_for_delivery" | "rto" | "pending" | "failed", number>; loading?: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const [daily, setDaily] = useState<{ label: string; n: number }[] | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const today = startOfDay(new Date());
    const edges = Array.from({ length: 15 }, (_, i) => new Date(+today - (13 - i) * day));
    bucketCounts(edges, (f, t) => sb.from("orders").select("id", { count: "exact", head: true }).gte("ordered_at", f).lt("ordered_at", t))
      .then(c => { if (live) setDaily(c ? c.map((n, i) => ({ label: short(edges[i]), n })) : null); })
      .catch(() => { if (live) setDaily(null); });
    return () => { live = false; };
  }, [sb]);

  const split = [
    { label: "Delivered", n: stats.delivered, color: "#55c08f" },
    { label: "In transit", n: stats.in_transit + stats.out_for_delivery, color: "var(--accent)" },
    { label: "Pending", n: stats.pending, color: "#f0b43c" },
    { label: "RTO / failed", n: stats.rto + stats.failed, color: "#ef8a7c" },
  ].filter(s => s.n > 0);
  const total = split.reduce((s, r) => s + r.n, 0);
  const closed = stats.delivered + stats.rto + stats.failed;
  const sum = daily?.reduce((s, d) => s + d.n, 0) ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3 mb-6">
      <div className={cn(PANEL, "lg:col-span-2 rise")}>
        <Head icon={TrendingUp} title="Orders per day" note={daily ? `${sum} in the last 14 days` : undefined} />
        {daily === undefined ? <div className="h-44 rounded-xl bg-[#f6f7f2] animate-pulse" />
        : daily === null ? <Empty text="Order history isn't available." />
        : sum === 0 ? <Empty text="No orders in the last 14 days." />
        : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                <defs><linearGradient id="ord" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity={0.55} /><stop offset="1" stopColor="var(--accent)" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a8a86" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                <Tooltip contentStyle={tip} formatter={(v: number) => [v, "Orders"]} />
                <Area type="monotone" dataKey="n" stroke="#1c1c1c" strokeWidth={2} fill="url(#ord)" animationDuration={800} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className={cn(PANEL, "rise")} style={{ animationDelay: "80ms" }}>
        <Head icon={PieIcon} title="Delivery status" note={closed > 0 ? `${Math.round((stats.delivered / closed) * 100)}% delivered` : undefined} />
        {loading && total === 0 ? <div className="h-32 rounded-xl bg-[#f6f7f2] animate-pulse" /> : total === 0 ? <Empty text="No orders match these filters." /> : (
          <div className="flex items-center gap-4">
            <div className="relative w-32 h-32 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={split} dataKey="n" nameKey="label" innerRadius="64%" outerRadius="100%" paddingAngle={split.length > 1 ? 2 : 0} stroke="none" animationDuration={700}>
                    {split.map(s => <Cell key={s.label} fill={s.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold text-[#1c1c1c] leading-none tabular-nums">{total}</span>
                <span className="text-[10px] text-[#6b6b67]">orders</span>
              </div>
            </div>
            <ul className="flex-1 min-w-0 space-y-2 text-xs">
              {split.map(s => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="truncate flex-1">{s.label}</span>
                  <b className="tabular-nums">{s.n}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const SEG_COLORS = ["var(--accent)", "#55c08f", "#f0b43c", "#ef8a7c", "#1c1c1c", "#8fb3e8", "#b9a3e3", "#d6d3cc"];

export function CustomersInsights() {
  const sb = useMemo(() => createClient(), []);
  const [weeks, setWeeks] = useState<{ label: string; n: number }[] | null | undefined>(undefined);
  const [segs, setSegs] = useState<{ label: string; n: number; color: string }[] | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const today = startOfDay(new Date());
    const edges = Array.from({ length: 9 }, (_, i) => new Date(+today + day - (8 - i) * 7 * day));
    bucketCounts(edges, (f, t) => sb.from("customers").select("id", { count: "exact", head: true }).gte("created_at", f).lt("created_at", t))
      .then(c => { if (live) setWeeks(c ? c.map((n, i) => ({ label: short(edges[i]), n })) : null); })
      .catch(() => { if (live) setWeeks(null); });
    const keys = Object.keys(SEGMENT_CONFIG) as CustomerSegment[];
    Promise.all(keys.map(k => sb.from("customers").select("id", { count: "exact", head: true }).eq("segment", k)))
      .then(rs => {
        if (!live) return;
        if (rs.some(r => r.error)) return setSegs(null);
        setSegs(keys.map((k, i) => ({ label: SEGMENT_CONFIG[k].label, n: rs[i].count ?? 0, color: SEG_COLORS[i] })).filter(s => s.n > 0).sort((a, b) => b.n - a.n));
      })
      .catch(() => { if (live) setSegs(null); });
    return () => { live = false; };
  }, [sb]);

  const added = weeks?.reduce((s, w) => s + w.n, 0) ?? 0;
  const segTotal = segs?.reduce((s, r) => s + r.n, 0) ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3 mb-6">
      <div className={cn(PANEL, "lg:col-span-2 rise")}>
        <Head icon={BarChart3} title="New customers per week" note={weeks ? `${added} in 8 weeks` : undefined} />
        {weeks === undefined ? <div className="h-44 rounded-xl bg-[#f6f7f2] animate-pulse" />
        : weeks === null ? <Empty text="Customer history isn't available." />
        : added === 0 ? <Empty text="No new customers in the last 8 weeks." />
        : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a8a86" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} cursor={{ fill: "#f6f7f2" }} formatter={(v: number) => [v, "New customers"]} labelFormatter={l => `Week of ${l}`} />
                <Bar dataKey="n" radius={[8, 8, 8, 8]} animationDuration={800}>
                  {weeks.map((w, i) => <Cell key={w.label} fill={i === weeks.length - 1 ? "var(--accent)" : "#1c1c1c"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className={cn(PANEL, "rise")} style={{ animationDelay: "80ms" }}>
        <Head icon={Users} title="Segments" note={segs ? `${segTotal} customers` : undefined} />
        {segs === undefined ? <div className="h-32 rounded-xl bg-[#f6f7f2] animate-pulse" />
        : segs === null ? <Empty text="Segments aren't available." />
        : segTotal === 0 ? <Empty text="No customers yet." />
        : (
          <ul className="space-y-2.5 text-xs">
            {segs.map(s => (
              <li key={s.label}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="truncate flex-1">{s.label}</span>
                  <b className="tabular-nums">{s.n}</b>
                  <span className="text-[10px] text-[#6b6b67] w-8 text-right">{Math.round((s.n / segTotal) * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#f0f0ec] overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${(s.n / segTotal) * 100}%`, background: s.color }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const OUTCOMES = [
  { key: "done", label: "Completed", color: "#55c08f" },
  { key: "whatsapp", label: "WhatsApp", color: "var(--accent)" },
  { key: "rescheduled", label: "Rescheduled", color: "#f0b43c" },
  { key: "no_answer", label: "No answer", color: "#ef8a7c" },
  { key: "skipped", label: "Skipped", color: "#d6d3cc" },
] as const;

/** Calls logged per day and how they ended, over the last 14 days. */
export function CallsInsights() {
  const sb = useMemo(() => createClient(), []);
  const [daily, setDaily] = useState<{ label: string; n: number }[] | null | undefined>(undefined);
  const [outcomes, setOutcomes] = useState<{ label: string; n: number; color: string }[] | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const today = startOfDay(new Date());
    const edges = Array.from({ length: 15 }, (_, i) => new Date(+today - (13 - i) * day));
    const calls = () => sb.from("call_logs").select("id", { count: "exact", head: true });
    bucketCounts(edges, (f, t) => calls().gte("called_at", f).lt("called_at", t))
      .then(c => { if (live) setDaily(c ? c.map((n, i) => ({ label: short(edges[i]), n })) : null); })
      .catch(() => { if (live) setDaily(null); });
    Promise.all(OUTCOMES.map(o => calls().gte("called_at", edges[0].toISOString()).eq("outcome", o.key)))
      .then(rs => {
        if (!live) return;
        if (rs.some(r => r.error)) return setOutcomes(null);
        setOutcomes(OUTCOMES.map((o, i) => ({ label: o.label, n: rs[i].count ?? 0, color: o.color })).filter(o => o.n > 0));
      })
      .catch(() => { if (live) setOutcomes(null); });
    return () => { live = false; };
  }, [sb]);

  const sum = daily?.reduce((s, d) => s + d.n, 0) ?? 0;
  const oTotal = outcomes?.reduce((s, o) => s + o.n, 0) ?? 0;
  const done = outcomes?.find(o => o.label === "Completed")?.n ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3 mb-6">
      <div className={cn(PANEL, "lg:col-span-2 rise")}>
        <Head icon={TrendingUp} title="Calls logged per day" note={daily ? `${sum} in the last 14 days` : undefined} />
        {daily === undefined ? <div className="h-44 rounded-xl bg-[#f6f7f2] animate-pulse" />
        : daily === null ? <Empty text="Call history isn't available." />
        : sum === 0 ? <Empty text="No calls logged in the last 14 days." />
        : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a8a86" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                <Tooltip contentStyle={tip} cursor={{ fill: "#f6f7f2" }} formatter={(v: number) => [v, "Calls"]} />
                <Bar dataKey="n" radius={[8, 8, 8, 8]} animationDuration={800}>
                  {daily.map((d, i) => <Cell key={d.label} fill={i === daily.length - 1 ? "var(--accent)" : "#1c1c1c"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className={cn(PANEL, "rise")} style={{ animationDelay: "80ms" }}>
        <Head icon={PieIcon} title="Call outcomes" note={oTotal > 0 ? `${Math.round((done / oTotal) * 100)}% completed` : undefined} />
        {outcomes === undefined ? <div className="h-32 rounded-xl bg-[#f6f7f2] animate-pulse" />
        : outcomes === null ? <Empty text="Call outcomes aren't available." />
        : oTotal === 0 ? <Empty text="No calls in the last 14 days." />
        : (
          <div className="flex items-center gap-4">
            <div className="relative w-32 h-32 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={outcomes} dataKey="n" nameKey="label" innerRadius="64%" outerRadius="100%" paddingAngle={outcomes.length > 1 ? 2 : 0} stroke="none" animationDuration={700}>
                    {outcomes.map(o => <Cell key={o.label} fill={o.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold text-[#1c1c1c] leading-none tabular-nums">{oTotal}</span>
                <span className="text-[10px] text-[#6b6b67]">calls</span>
              </div>
            </div>
            <ul className="flex-1 min-w-0 space-y-2 text-xs">
              {outcomes.map(o => (
                <li key={o.label} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: o.color }} />
                  <span className="truncate flex-1">{o.label}</span>
                  <b className="tabular-nums">{o.n}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
