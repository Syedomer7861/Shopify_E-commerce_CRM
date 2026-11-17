/**
 * KPI scoring. Pure functions, no I/O, safe on client and server.
 *
 * achievement  higher-is-better: actual / target × 100
 *              lower-is-better:  target / actual × 100 (actual 0 = perfect)
 *              boolean:          100 when true, 0 when false
 * cap          achievement never exceeds `cap` (default 120)
 * threshold    achievement below `threshold` scores 0 (default off)
 * weighted     achievement × weight / 100
 * overall      sum of weighted / sum of weights actually scored × 100
 *
 * Missing data is never silently zero: an item with no actual is left out
 * and reported, unless its rule says `missing: "zero"`.
 */
export type Measurement = "numeric" | "percentage" | "currency" | "time" | "rating" | "boolean" | "milestone";
export type Direction = "higher" | "lower";
export type MissingRule = "exclude" | "zero";

export type KpiRule = {
  key: string;
  name: string;
  measurement: Measurement;
  direction: Direction;
  target: number | null;
  weight: number;
  cap?: number | null;
  threshold?: number | null;
  missing?: MissingRule;
};

export type ItemStatus = "scored" | "missing" | "no_target";
export type ScoredItem = { key: string; actual: number | null; achievement: number | null; weighted: number | null; status: ItemStatus };
export type Band = "exceeds" | "meets" | "needs_improvement" | "below";
export type ScoreResult = {
  items: ScoredItem[];
  overall: number | null;
  band: Band | null;
  weightTotal: number;
  weightScored: number;
  coverage: number; // share of configured weight that had data, 0-100
};

export const DEFAULT_CAP = 120;
export const BANDS: { band: Band; min: number }[] = [
  { band: "exceeds", min: 100 }, { band: "meets", min: 80 }, { band: "needs_improvement", min: 60 }, { band: "below", min: -Infinity },
];

const round = (n: number) => Math.round(n * 100) / 100;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Achievement % for one KPI, or null when it can't be computed (no actual / no usable target). */
export function achievement(rule: KpiRule, actual: number | null | undefined): number | null {
  if (!finite(actual)) return null;
  const cap = finite(rule.cap) ? rule.cap : DEFAULT_CAP;
  let a: number;
  if (rule.measurement === "boolean") a = actual > 0 ? 100 : 0;
  else {
    const t = rule.target;
    if (!finite(t) || t <= 0) return null; // no target, or one that makes the ratio meaningless
    if (rule.direction === "lower") a = actual <= 0 ? cap : (t / actual) * 100;
    else a = (actual / t) * 100;
  }
  a = Math.max(0, Math.min(cap, a));
  if (finite(rule.threshold) && a < rule.threshold) a = 0;
  return round(a);
}

export function bandFor(score: number | null): Band | null {
  if (score === null) return null;
  return BANDS.find(b => score >= b.min)!.band;
}

/** Sum of weights; plans should total 100. */
export function weightCheck(rules: Pick<KpiRule, "weight">[]) {
  const total = round(rules.reduce((s, r) => s + (finite(r.weight) ? r.weight : 0), 0));
  return { total, ok: Math.abs(total - 100) < 0.01, invalid: rules.some(r => !finite(r.weight) || r.weight < 0) };
}

export function scorePlan(rules: KpiRule[], actuals: Record<string, number | null | undefined>): ScoreResult {
  let weightScored = 0;
  let sum = 0;
  const items = rules.map((r): ScoredItem => {
    const actual = finite(actuals[r.key]) ? (actuals[r.key] as number) : null;
    let ach = achievement(r, actual);
    let status: ItemStatus = "scored";
    if (actual === null) {
      if (r.missing === "zero" && finite(r.target) && r.target > 0) ach = 0;
      else status = "missing";
    } else if (ach === null) status = "no_target";
    if (status !== "scored" || ach === null) return { key: r.key, actual, achievement: null, weighted: null, status };
    const w = Math.max(0, finite(r.weight) ? r.weight : 0);
    weightScored += w;
    sum += ach * w;
    return { key: r.key, actual, achievement: ach, weighted: round((ach * w) / 100), status };
  });
  const weightTotal = rules.reduce((s, r) => s + Math.max(0, finite(r.weight) ? r.weight : 0), 0);
  const overall = weightScored > 0 ? round(sum / weightScored) : null;
  return {
    items, overall, band: bandFor(overall),
    weightTotal: round(weightTotal), weightScored: round(weightScored),
    coverage: weightTotal > 0 ? round((weightScored / weightTotal) * 100) : 0,
  };
}
