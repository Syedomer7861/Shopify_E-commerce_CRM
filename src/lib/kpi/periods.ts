import { addMonths, endOfMonth, endOfQuarter, endOfWeek, endOfYear, format, startOfMonth, startOfQuarter, startOfWeek, startOfYear, subMonths, subQuarters, subWeeks, subYears } from "date-fns";
import type { KpiRange } from "./sources";

export type KpiPeriod = { label: string; from: string; to: string };
const day = (d: Date) => format(d, "yyyy-MM-dd");

/** One review period of the given kind, `back` periods before the one containing `now`. */
function periodAt(kind: string, now: Date, back: number): KpiPeriod {
  switch (kind) {
    case "weekly": {
      const s = startOfWeek(subWeeks(now, back), { weekStartsOn: 1 });
      return { label: `Week of ${format(s, "d MMM yyyy")}`, from: day(s), to: day(endOfWeek(s, { weekStartsOn: 1 })) };
    }
    case "quarterly": {
      const s = startOfQuarter(subQuarters(now, back));
      return { label: `${format(s, "QQQ yyyy")}`, from: day(s), to: day(endOfQuarter(s)) };
    }
    case "half_yearly": {
      const anchor = subMonths(startOfMonth(now), back * 6);
      const s = new Date(anchor.getFullYear(), anchor.getMonth() < 6 ? 0 : 6, 1);
      return { label: `${s.getMonth() === 0 ? "H1" : "H2"} ${s.getFullYear()}`, from: day(s), to: day(endOfMonth(addMonths(s, 5))) };
    }
    case "yearly": {
      const s = startOfYear(subYears(now, back));
      return { label: `${s.getFullYear()}`, from: day(s), to: day(endOfYear(s)) };
    }
    default: {
      const s = startOfMonth(subMonths(now, back));
      return { label: format(s, "MMMM yyyy"), from: day(s), to: day(endOfMonth(s)) };
    }
  }
}

/** The current period first, then the previous ones. */
export function recentPeriods(kind: string, count = 6, now = new Date()): KpiPeriod[] {
  return Array.from({ length: count }, (_, i) => periodAt(kind, now, i));
}

/** Query bounds for a period: local-midnight instants plus the plain days. */
export function periodRange(p: KpiPeriod): KpiRange {
  const [y1, m1, d1] = p.from.split("-").map(Number);
  const [y2, m2, d2] = p.to.split("-").map(Number);
  return { from: p.from, to: p.to, start: new Date(y1, m1 - 1, d1).toISOString(), end: new Date(y2, m2 - 1, d2, 23, 59, 59, 999).toISOString() };
}

