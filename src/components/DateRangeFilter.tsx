"use client";
import { addDays, endOfMonth, endOfQuarter, endOfYear, format, startOfMonth, startOfQuarter, startOfYear, subDays, subMonths } from "date-fns";
import { CalendarRange, X } from "lucide-react";
import { Select } from "@/components/ui";

/** "" = open end. Dates are local calendar days (yyyy-MM-dd), inclusive. */
export type DateRange = { preset: string; from: string; to: string };
export const ALL_TIME: DateRange = { preset: "all", from: "", to: "" };

const f = (d: Date) => format(d, "yyyy-MM-dd");
const PRESETS: { value: string; label: string; range?: () => [Date, Date] }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today", range: () => [new Date(), new Date()] },
  { value: "yesterday", label: "Yesterday", range: () => [subDays(new Date(), 1), subDays(new Date(), 1)] },
  { value: "7d", label: "Last 7 days", range: () => [subDays(new Date(), 6), new Date()] },
  { value: "30d", label: "Last 30 days", range: () => [subDays(new Date(), 29), new Date()] },
  { value: "90d", label: "Last 90 days", range: () => [subDays(new Date(), 89), new Date()] },
  { value: "month", label: "This month", range: () => [startOfMonth(new Date()), endOfMonth(new Date())] },
  { value: "lastmonth", label: "Last month", range: () => [startOfMonth(subMonths(new Date(), 1)), endOfMonth(subMonths(new Date(), 1))] },
  { value: "quarter", label: "This quarter", range: () => [startOfQuarter(new Date()), endOfQuarter(new Date())] },
  { value: "year", label: "This year", range: () => [startOfYear(new Date()), endOfYear(new Date())] },
  { value: "custom", label: "Custom range" },
];

export function presetRange(preset: string): DateRange {
  const p = PRESETS.find(x => x.value === preset);
  if (!p?.range) return { preset, from: "", to: "" };
  const [a, b] = p.range();
  return { preset, from: f(a), to: f(b) };
}

const localDay = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd); };

/**
 * Narrow a Supabase query to the range. `dateOnly` for DATE columns (compared
 * as plain days); otherwise timestamp columns get local-midnight bounds so
 * "today" means the user's today, not UTC's.
 */
export function applyDateRange<Q extends { gte: (c: string, v: string) => Q; lt: (c: string, v: string) => Q; lte: (c: string, v: string) => Q }>(
  q: Q, col: string, r: DateRange, dateOnly = false,
): Q {
  if (r.from) q = q.gte(col, dateOnly ? r.from : localDay(r.from).toISOString());
  if (r.to) q = dateOnly ? q.lte(col, r.to) : q.lt(col, addDays(localDay(r.to), 1).toISOString());
  return q;
}

/** Same rule for rows already in memory. */
export function inDateRange(value: string | null | undefined, r: DateRange): boolean {
  if (!r.from && !r.to) return true;
  if (!value) return false;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : f(new Date(value));
  return (!r.from || d >= r.from) && (!r.to || d <= r.to);
}

export function DateRangeFilter({ value, onChange, className }: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  const active = value.from || value.to;
  return (
    <div className={"flex flex-wrap items-center gap-1.5 " + (className ?? "")}>
      <CalendarRange className="w-3.5 h-3.5 text-gray-400" aria-hidden />
      <Select
        value={value.preset}
        onChange={v => onChange(v === "custom" ? { ...value, preset: "custom" } : presetRange(v))}
        triggerClassName="text-xs h-8 min-w-[130px]"
        options={PRESETS.map(p => ({ value: p.value, label: p.label }))}
      />
      {value.preset === "custom" && (
        <>
          <input type="date" aria-label="From date" className="input text-xs h-8 w-[140px]" value={value.from} max={value.to || undefined}
            onChange={e => onChange({ ...value, from: e.target.value })} />
          <span className="text-[10px] text-gray-400">to</span>
          <input type="date" aria-label="To date" className="input text-xs h-8 w-[140px]" value={value.to} min={value.from || undefined}
            onChange={e => onChange({ ...value, to: e.target.value })} />
        </>
      )}
      {active && (
        <button type="button" onClick={() => onChange(ALL_TIME)} aria-label="Clear date filter" className="p-1 rounded hover:bg-gray-100 text-gray-400">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/** Short human label for a range, e.g. "Last 30 days" or "1 Oct – 17 Nov". */
export function rangeLabel(r: DateRange): string {
  if (!r.from && !r.to) return "All time";
  const p = PRESETS.find(x => x.value === r.preset);
  if (p && p.value !== "custom") return p.label;
  const fmt = (d: string) => format(localDay(d), "d MMM yyyy");
  return r.from && r.to ? `${fmt(r.from)} – ${fmt(r.to)}` : r.from ? `Since ${fmt(r.from)}` : `Until ${fmt(r.to)}`;
}
