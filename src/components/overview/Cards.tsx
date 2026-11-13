"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Small building blocks shared by the department overviews (HR, Finance,
// Service Desk, Leads & Deals, Field Visits).

export const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const shortDay = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const cardTitle = "text-xs font-black text-[#1c1c1c] uppercase tracking-widest";

export function Kpi({ label, value, sub, href, warn }: { label: string; value: ReactNode; sub: string; href?: string; warn?: boolean }) {
  const body = (
    <div className={cn("card p-5 h-full transition-colors", href && "hover:border-[#1c1c1c]/20", warn && "ring-1 ring-amber-300")}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-gray-500">{label}</span>
        {href && <ArrowUpRight className="w-3.5 h-3.5 text-gray-400" />}
      </div>
      <div className={cn("text-3xl font-black tabular-nums mt-3", warn ? "text-amber-700" : "text-[#1c1c1c]")}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-1">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Panel({ title, note, className, children }: { title: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("card p-6", className)}>
      <h3 className={cardTitle}>{title}</h3>
      {note && <p className="text-[11px] text-gray-400 mt-1">{note}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Horizontal bars, one per row. `show` formats the figure on the right. */
export function BarList({ rows, empty, show = r => String(r.count), by = "count" }: {
  rows: { label: string; count: number; value: number }[]; empty: string;
  show?: (r: { label: string; count: number; value: number }) => string; by?: "count" | "value";
}) {
  const shown = rows.filter(r => r[by] > 0).slice(0, 7);
  if (shown.length === 0) return <p className="text-xs text-gray-400">{empty}</p>;
  const max = Math.max(1, ...shown.map(r => r[by]));
  return (
    <div className="space-y-3">
      {shown.map(r => (
        <div key={r.label}>
          <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-[#1c1c1c] capitalize">{r.label.replace(/_/g, " ")}</span><span className="tabular-nums text-gray-500">{show(r)}</span></div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-[#1c1c1c]" style={{ width: `${(r[by] / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars per day, newest on the right and highlighted. */
export function DayBars({ days, label, empty }: { days: { day: string; count: number }[]; label: string; empty: string }) {
  if (days.every(d => d.count === 0)) return <p className="text-xs text-gray-400 py-8 text-center">{empty}</p>;
  const max = Math.max(1, ...days.map(d => d.count));
  return (
    <div className="flex items-end gap-1.5 h-32" role="img" aria-label={label}>
      {days.map((d, i) => (
        <div key={d.day} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${shortDay(d.day)}: ${d.count}`}>
          {d.count > 0 && <span className="text-[9px] text-gray-400 tabular-nums">{d.count}</span>}
          <div className={cn("w-full rounded-md", d.count === 0 ? "bg-gray-100 h-1" : i === days.length - 1 ? "bg-orange-500" : "bg-emerald-200")}
            style={d.count === 0 ? undefined : { height: `${(d.count / max) * 100}%` }} />
          {i % 2 === (days.length - 1) % 2 && <span className="text-[9px] text-gray-400 whitespace-nowrap">{shortDay(d.day)}</span>}
        </div>
      ))}
    </div>
  );
}

/** A short list of rows with a right-hand tag (due dates, planned times). */
export function MiniList({ rows, empty }: { rows: { id: string; title: string; sub?: string; tag: string; warn?: boolean }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-gray-400">{empty}</p>;
  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.id} className="flex items-center gap-3">
          <div className="flex-1 min-w-0"><div className="text-xs font-bold truncate">{r.title}</div>{r.sub && <div className="text-[10px] text-gray-400 truncate">{r.sub}</div>}</div>
          <span className={cn("text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap", r.warn ? "bg-amber-50 text-amber-700" : "bg-gray-50")}>{r.tag}</span>
        </div>
      ))}
    </div>
  );
}
