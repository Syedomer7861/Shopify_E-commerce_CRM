// Revenue figures for Super Admin > Revenue, computed from org_subscriptions.
//
// A row created with a trial (trial_ends_at set) never pays: converting a trial
// means assigning the plan again, which cancels the trial row and creates a new
// active row (platform_assign_subscription). So a row is paying from created_at
// until cancelled_at exactly when trial_ends_at is null. These are contracted
// amounts, not payments received. Money is in minor units.

export type Sub = {
  org_id: string;
  status: "trialing" | "active" | "cancelled";
  billing_cycle: "monthly" | "yearly";
  currency: string;
  price_minor: number;
  trial_ends_at: string | null;
  current_period_end: string;
  created_at: string;
  cancelled_at: string | null;
};

/** Same rounding as platform_revenue_summary (integer division for yearly). */
export const monthlyMinor = (s: Sub) => (s.billing_cycle === "monthly" ? s.price_minor : Math.floor(s.price_minor / 12));

export const payingAt = (s: Sub, t: Date) =>
  s.trial_ends_at == null && new Date(s.created_at) <= t && (!s.cancelled_at || new Date(s.cancelled_at) > t);

/** MRR per currency at an instant. */
export function mrrAt(subs: Sub[], t: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of subs) if (payingAt(s, t)) out[s.currency] = (out[s.currency] || 0) + monthlyMinor(s);
  return out;
}

export type Movement = { start: number; new: number; expansion: number; contraction: number; churned: number; end: number };

/**
 * How MRR moved between two instants, per currency, organisation by organisation:
 * from nothing = new, to nothing = churned, otherwise up = expansion, down = contraction.
 * A plan change (old row cancelled, new row created) is therefore never counted as churn.
 */
export function movement(subs: Sub[], from: Date, to: Date): Record<string, Movement> {
  const per = new Map<string, { a: number; b: number }>();
  for (const s of subs) {
    const k = `${s.currency}|${s.org_id}`;
    const v = per.get(k) || { a: 0, b: 0 };
    per.set(k, { a: v.a + (payingAt(s, from) ? monthlyMinor(s) : 0), b: v.b + (payingAt(s, to) ? monthlyMinor(s) : 0) });
  }
  const out: Record<string, Movement> = {};
  for (const [k, { a, b }] of per) {
    const cur = k.split("|")[0];
    const m = out[cur] || { start: 0, new: 0, expansion: 0, contraction: 0, churned: 0, end: 0 };
    out[cur] = {
      start: m.start + a, end: m.end + b,
      new: m.new + (a === 0 && b > 0 ? b : 0),
      churned: m.churned + (a > 0 && b === 0 ? a : 0),
      expansion: m.expansion + (a > 0 && b > a ? b - a : 0),
      contraction: m.contraction + (b > 0 && b < a ? a - b : 0),
    };
  }
  return out;
}

/** Start of the month containing t, in UTC. */
export const monthStart = (t: Date, offset = 0) => new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1));

/** MRR at the end of each of the last n months (the current month uses now). */
export function mrrSeries(subs: Sub[], now: Date, n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const start = monthStart(now, i - n + 1);
    const end = i === n - 1 ? now : new Date(monthStart(now, i - n + 2).getTime() - 1);
    return { month: start.toISOString().slice(0, 7), mrr: mrrAt(subs, end) };
  });
}
