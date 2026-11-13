// Overview figures for the department pages (Finance, Service Desk, Leads &
// Deals, Field Visits), computed from rows the viewer can already read: row
// security decides whose records are counted, these functions only add up.
// Dates compare as YYYY-MM-DD strings in local time.

type Row = Record<string, any>;
const DAY = 86_400_000;
const HOUR = 3_600_000;
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Date-only values (DATE columns) are already local days; timestamps are converted.
const localDay = (v: string | null | undefined) => (!v ? "" : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ymd(new Date(v)));
const num = (v: unknown) => Number(v) || 0;
const sum = (rows: Row[], key: string) => rows.reduce((s, r) => s + num(r[key]), 0);
const lower = (v: unknown) => String(v ?? "").toLowerCase();

/** Count (and optionally sum) rows per key, biggest first. */
export function groupBy(rows: Row[], key: string, valueKey?: string, blank = "Not set") {
  const m = new Map<string, { count: number; value: number }>();
  for (const r of rows) {
    const k = String(r[key] ?? "").trim() || blank;
    const g = m.get(k) || { count: 0, value: 0 };
    m.set(k, { count: g.count + 1, value: g.value + (valueKey ? num(r[valueKey]) : 0) });
  }
  return [...m.entries()].map(([label, g]) => ({ label, ...g })).sort((a, b) => (valueKey ? b.value - a.value : b.count - a.count));
}

/** Rows per day for the last `days` days (oldest first), by a date/timestamp column. */
export function perDay(rows: Row[], key: string, today: Date, days = 14) {
  return Array.from({ length: days }, (_, i) => {
    const d = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i)));
    return { day: d, count: rows.filter(r => localDay(r[key]) === d).length };
  });
}

export function financeOverview(expenses: Row[], invoices: Row[], today: Date) {
  const t = ymd(today), month = t.slice(0, 7);
  const pending = expenses.filter(e => lower(e.status) === "pending");
  const approvedThisMonth = expenses.filter(e => lower(e.status) === "approved" && String(e.expense_date || "").startsWith(month));
  const unpaid = invoices.filter(i => !["paid", "cancelled", "draft"].includes(i.status));
  const overdue = unpaid.filter(i => i.status === "overdue" || (i.due_date && i.due_date < t));
  return {
    pendingClaims: pending.length,
    pendingClaimsValue: sum(pending, "amount"),
    approvedThisMonth: sum(approvedThisMonth, "amount"),
    receivable: sum(unpaid.filter(i => i.direction === "receivable"), "amount"),
    payable: sum(unpaid.filter(i => i.direction === "payable"), "amount"),
    overdueCount: overdue.length,
    overdueValue: sum(overdue, "amount"),
    claimsByCategory: groupBy(expenses.filter(e => String(e.expense_date || "").startsWith(month) && lower(e.status) !== "rejected"), "category", "amount"),
    dueNext: unpaid.filter(i => i.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5),
  };
}

const OPEN_TICKET = (s: string) => s !== "resolved" && s !== "closed";

export function serviceDeskOverview(tickets: Row[], now: Date) {
  const n = now.getTime();
  const open = tickets.filter(x => OPEN_TICKET(x.status));
  const resolved7 = tickets.filter(x => x.resolved_at && n - new Date(x.resolved_at).getTime() <= 7 * DAY);
  const hours = resolved7.map(x => (new Date(x.resolved_at).getTime() - new Date(x.created_at).getTime()) / HOUR).filter(h => h >= 0);
  const closedOnTime = resolved7.filter(x => !x.sla_due_at || new Date(x.resolved_at) <= new Date(x.sla_due_at));
  return {
    open: open.length,
    unassigned: open.filter(x => !x.assignee_id).length,
    breached: open.filter(x => x.sla_due_at && new Date(x.sla_due_at).getTime() < n).length,
    dueSoon: open.filter(x => x.sla_due_at && new Date(x.sla_due_at).getTime() >= n && new Date(x.sla_due_at).getTime() - n <= 4 * HOUR).length,
    resolved7: resolved7.length,
    avgResolveHours: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
    slaMet7: resolved7.length ? Math.round((closedOnTime.length / resolved7.length) * 100) : null,
    openByCategory: groupBy(open, "category"),
    openByPriority: ["urgent", "high", "normal", "low"].map(p => ({ label: p, count: open.filter(x => x.priority === p).length, value: 0 })),
    raisedPerDay: perDay(tickets, "created_at", now, 14),
  };
}

const OPEN_DEAL = ["open", "proposal", "negotiation"];

export function salesOverview(leads: Row[], deals: Row[], today: Date) {
  const n = today.getTime(), month = ymd(today).slice(0, 7);
  const recent = leads.filter(l => n - new Date(l.created_at).getTime() <= 30 * DAY);
  const decided = leads.filter(l => l.status === "converted" || l.status === "lost");
  const openDeals = deals.filter(d => OPEN_DEAL.includes(d.status));
  const closedDeals = deals.filter(d => d.status === "won" || d.status === "lost");
  const wonThisMonth = deals.filter(d => d.status === "won" && localDay(d.expected_close || d.created_at).startsWith(month));
  return {
    newLeads30: recent.length,
    notContacted: leads.filter(l => l.status === "new" && n - new Date(l.created_at).getTime() >= 2 * DAY).length,
    conversion: decided.length ? Math.round((decided.filter(l => l.status === "converted").length / decided.length) * 100) : null,
    pipeline: sum(openDeals, "value"),
    openDeals: openDeals.length,
    wonThisMonth: sum(wonThisMonth, "value"),
    winRate: closedDeals.length ? Math.round((closedDeals.filter(d => d.status === "won").length / closedDeals.length) * 100) : null,
    byStage: OPEN_DEAL.map(s => ({ label: s, count: deals.filter(d => d.status === s).length, value: sum(deals.filter(d => d.status === s), "value") })),
    leadsBySource: groupBy(recent, "source"),
    closingSoon: openDeals.filter(d => d.expected_close).sort((a, b) => a.expected_close.localeCompare(b.expected_close)).slice(0, 5),
  };
}

export function fieldOverview(visits: Row[], now: Date) {
  const t = ymd(now), n = now.getTime();
  const last30 = visits.filter(v => n - new Date(v.planned_at).getTime() <= 30 * DAY && new Date(v.planned_at).getTime() <= n);
  const done30 = last30.filter(v => v.status === "completed" || v.status === "checked_in");
  return {
    today: visits.filter(v => localDay(v.planned_at) === t && v.status !== "cancelled").length,
    onSite: visits.filter(v => v.status === "checked_in").length,
    missed: visits.filter(v => v.status === "planned" && n - new Date(v.planned_at).getTime() > 12 * HOUR).length,
    completed7: visits.filter(v => v.status === "completed" && v.check_out_at && n - new Date(v.check_out_at).getTime() <= 7 * DAY).length,
    completion30: last30.length ? Math.round((done30.length / last30.length) * 100) : null,
    withProof30: done30.filter(v => v.check_in_lat != null).length,
    checkInsPerDay: perDay(visits.filter(v => v.check_in_at), "check_in_at", now, 14),
    upcoming: visits.filter(v => v.status === "planned" && new Date(v.planned_at).getTime() >= n).sort((a, b) => a.planned_at.localeCompare(b.planned_at)).slice(0, 5),
  };
}
