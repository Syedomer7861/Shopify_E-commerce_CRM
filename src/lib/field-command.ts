/**
 * Field command view: which visits need a manager's attention, per-rep
 * summaries and the day's numbers. Pure, so scripts/check-field-command.mjs
 * can test it without a browser or database.
 */

export type FieldVisit = {
  id: string; party_name: string; purpose: string | null; status: string;
  planned_at: string; check_in_at: string | null; check_out_at: string | null;
  check_in_lat: number | null; check_in_lng: number | null; check_in_accuracy_m?: number | null;
  check_in_photo_path?: string | null; outcome: string | null; owner_id: string | null; created_at: string;
};

export type Range = "today" | "7d" | "30d";
export type Filter = "all" | "on_site" | "planned" | "done" | "missed";
export type Issue = { visit: FieldVisit; kind: "missed" | "long_on_site" | "no_outcome" | "weak_location"; title: string; detail: string };

const HOUR = 3_600_000;
export const MISSED_AFTER_H = 12;      // same rule as the Field overview's "Missed" card
export const LONG_ON_SITE_H = 4;
export const WEAK_LOCATION_M = 150;

const t = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN);

export function isMissed(v: FieldVisit, now: number) {
  return v.status === "planned" && t(v.planned_at) < now - MISSED_AFTER_H * HOUR;
}

/** Start of the range in ms. "today" is local midnight. */
export function rangeStart(range: Range, now: Date) {
  if (range === "today") { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
  return now.getTime() - (range === "7d" ? 7 : 30) * 24 * HOUR;
}

/** A visit belongs to the range when it was planned or checked into within it. */
export function inRange(v: FieldVisit, start: number) {
  return t(v.planned_at) >= start || t(v.check_in_at) >= start;
}

export function matches(v: FieldVisit, f: Filter, now: number) {
  if (f === "all") return true;
  if (f === "on_site") return v.status === "checked_in";
  if (f === "done") return v.status === "completed";
  if (f === "missed") return isMissed(v, now);
  return v.status === "planned" && !isMissed(v, now);
}

export function issues(visits: FieldVisit[], now: number): Issue[] {
  const out: Issue[] = [];
  for (const v of visits) {
    if (isMissed(v, now)) {
      out.push({ visit: v, kind: "missed", title: `Missed visit: ${v.party_name}`, detail: `Planned ${Math.round((now - t(v.planned_at)) / HOUR)}h ago, never checked in` });
    } else if (v.status === "checked_in" && t(v.check_in_at) < now - LONG_ON_SITE_H * HOUR) {
      out.push({ visit: v, kind: "long_on_site", title: `Still on site: ${v.party_name}`, detail: `Checked in ${Math.round((now - t(v.check_in_at)) / HOUR)}h ago, not checked out` });
    }
    if (v.status === "completed" && !v.outcome?.trim()) {
      out.push({ visit: v, kind: "no_outcome", title: `No outcome: ${v.party_name}`, detail: "Completed without saying what happened" });
    }
    if (v.check_in_lat != null && (v.check_in_accuracy_m ?? 0) > WEAK_LOCATION_M) {
      out.push({ visit: v, kind: "weak_location", title: `Weak location: ${v.party_name}`, detail: `GPS only accurate to ±${Math.round(v.check_in_accuracy_m!)}m` });
    }
  }
  const order = { missed: 0, long_on_site: 1, no_outcome: 2, weak_location: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || t(b.visit.planned_at) - t(a.visit.planned_at));
}

export type RepSummary = { id: string; visits: number; done: number; onSite: number; missed: number; last: FieldVisit | null };

export function reps(visits: FieldVisit[], now: number): RepSummary[] {
  const by = new Map<string, RepSummary>();
  for (const v of visits) {
    const id = v.owner_id || "none";
    const r = by.get(id) ?? { id, visits: 0, done: 0, onSite: 0, missed: 0, last: null };
    by.set(id, {
      ...r,
      visits: r.visits + 1,
      done: r.done + (v.status === "completed" ? 1 : 0),
      onSite: r.onSite + (v.status === "checked_in" ? 1 : 0),
      missed: r.missed + (isMissed(v, now) ? 1 : 0),
      last: v.check_in_at && (!r.last || t(v.check_in_at) > t(r.last.check_in_at)) ? v : r.last,
    });
  }
  return [...by.values()].sort((a, b) => b.onSite - a.onSite || b.visits - a.visits);
}

export function stats(visits: FieldVisit[], now: number) {
  const checked = visits.filter(v => v.check_in_at);
  const stays = visits.filter(v => v.check_in_at && v.check_out_at).map(v => t(v.check_out_at) - t(v.check_in_at)).filter(ms => ms > 0);
  const due = visits.filter(v => v.status !== "cancelled" && t(v.planned_at) <= now);
  const done = visits.filter(v => v.status === "completed").length;
  return {
    total: visits.length,
    onSite: visits.filter(v => v.status === "checked_in").length,
    done,
    completion: due.length ? Math.round((done / due.length) * 100) : null,
    avgStayMin: stays.length ? Math.round(stays.reduce((a, b) => a + b, 0) / stays.length / 60_000) : null,
    proof: checked.length ? Math.round((checked.filter(v => v.check_in_lat != null).length / checked.length) * 100) : null,
    missed: visits.filter(v => isMissed(v, now)).length,
  };
}

/** One rep's check-ins in time order: the trail drawn on the map. */
export function trail(visits: FieldVisit[], repId: string): [number, number][] {
  return visits
    .filter(v => v.owner_id === repId && v.check_in_lat != null && v.check_in_lng != null && v.check_in_at)
    .sort((a, b) => t(a.check_in_at) - t(b.check_in_at))
    .map(v => [Number(v.check_in_lat), Number(v.check_in_lng)]);
}
