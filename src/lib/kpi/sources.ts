import type { Direction, Measurement } from "./score";

/**
 * KPI data sources: each metric key maps to one query on a real table,
 * run with the caller's Supabase client so RLS decides what may be counted
 * (an employee: their own rows; a manager: their team's, per role scope).
 *
 * compute() returns null when the source can't be read (table missing, no
 * access), so the engine shows "no data" instead of a made-up 0. A KPI
 * whose key isn't listed here is a manual KPI. Add a source = one entry.
 */
export type KpiRange = { start: string; end: string; from: string; to: string }; // ISO instants + yyyy-MM-dd days
export type KpiSource = {
  key: string;
  /** Roles-page module whose view grant lets someone read this for another person. */
  grant: string;
  label: string;
  group: string;
  measurement: Measurement;
  unit: string;
  direction: Direction;
  note?: string;
  compute: (sb: any, userId: string, r: KpiRange) => Promise<number | null>;
};

const PAGE = 1000;
// Every matching row, paged past PostgREST's 1000-row cap. null on error.
async function all(make: () => any): Promise<any[] | null> {
  const out: any[] = [];
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) return null;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
async function count(q: any): Promise<number | null> {
  const { count: n, error } = await q;
  return error ? null : n ?? 0;
}
const inR = (q: any, col: string, r: KpiRange) => q.gte(col, r.start).lte(col, r.end);
const inDays = (q: any, col: string, r: KpiRange) => q.gte(col, r.from).lte(col, r.to);
const sum = (rows: any[], f: (x: any) => number) => rows.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 100 : null);

export const KPI_SOURCES: KpiSource[] = [
  // ── Calling ────────────────────────────────────────────────────────────────
  { key: "calls.total", grant: "customers", label: "Total calls", group: "Calling", measurement: "numeric", unit: "calls", direction: "higher",
    compute: (sb, u, r) => count(inR(sb.from("raw_call_logs").select("id", { count: "exact", head: true }).eq("agent_id", u), "created_at", r)) },
  { key: "calls.talked", grant: "customers", label: "Calls with talk time", group: "Calling", measurement: "numeric", unit: "calls", direction: "higher",
    note: "Call status isn't recorded reliably; a call counts once it has talk time.",
    compute: (sb, u, r) => count(inR(sb.from("raw_call_logs").select("id", { count: "exact", head: true }).eq("agent_id", u).gt("duration_seconds", 0), "created_at", r)) },
  { key: "calls.talk_minutes", grant: "customers", label: "Talk time", group: "Calling", measurement: "time", unit: "min", direction: "higher",
    compute: async (sb, u, r) => { const rows = await all(() => inR(sb.from("raw_call_logs").select("duration_seconds").eq("agent_id", u), "created_at", r)); return rows && Math.round(sum(rows, x => x.duration_seconds) / 60); } },
  { key: "calls.followups", grant: "customers", label: "Follow-ups scheduled", group: "Calling", measurement: "numeric", unit: "follow-ups", direction: "higher",
    compute: (sb, u, r) => count(inR(sb.from("call_logs").select("id, task:tasks!inner(assigned_to)", { count: "exact", head: true }).eq("task.assigned_to", u).eq("outcome", "rescheduled"), "called_at", r)) },
  { key: "calltasks.closed", grant: "customers", label: "Call tasks completed", group: "Calling", measurement: "numeric", unit: "tasks", direction: "higher",
    compute: (sb, u, r) => count(inR(sb.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", u).eq("status", "done"), "completed_at", r)) },
  { key: "calltasks.done_rate", grant: "customers", label: "Call task done rate", group: "Calling", measurement: "percentage", unit: "%", direction: "higher",
    compute: async (sb, u, r) => {
      const rows = await all(() => inR(sb.from("tasks").select("status").eq("assigned_to", u).in("status", ["done", "skipped", "cancelled"]), "completed_at", r));
      return rows && pct(rows.filter(x => x.status === "done").length, rows.length);
    } },

  // ── Sales ──────────────────────────────────────────────────────────────────
  { key: "sales.leads_added", grant: "leads", label: "Leads added", group: "Sales", measurement: "numeric", unit: "leads", direction: "higher",
    compute: (sb, u, r) => count(inR(sb.from("leads").select("id", { count: "exact", head: true }).eq("owner_id", u), "created_at", r)) },
  { key: "sales.leads_converted", grant: "leads", label: "Leads converted", group: "Sales", measurement: "numeric", unit: "leads", direction: "higher",
    compute: (sb, u, r) => count(inR(sb.from("leads").select("id", { count: "exact", head: true }).eq("owner_id", u).eq("status", "converted"), "created_at", r)) },
  { key: "sales.lead_conversion", grant: "leads", label: "Lead conversion rate", group: "Sales", measurement: "percentage", unit: "%", direction: "higher",
    compute: async (sb, u, r) => { const rows = await all(() => inR(sb.from("leads").select("status").eq("owner_id", u), "created_at", r)); return rows && pct(rows.filter(x => x.status === "converted").length, rows.length); } },
  { key: "sales.deals_won", grant: "deals", label: "Deals closed (won)", group: "Sales", measurement: "numeric", unit: "deals", direction: "higher",
    note: "Deals carry no close date, so the period follows when the deal was created.",
    compute: (sb, u, r) => count(inR(sb.from("deals").select("id", { count: "exact", head: true }).eq("owner_id", u).eq("status", "won"), "created_at", r)) },
  { key: "sales.revenue_won", grant: "deals", label: "Revenue won", group: "Sales", measurement: "currency", unit: "₹", direction: "higher",
    compute: async (sb, u, r) => { const rows = await all(() => inR(sb.from("deals").select("value").eq("owner_id", u).eq("status", "won"), "created_at", r)); return rows && sum(rows, x => x.value); } },
  { key: "sales.win_rate", grant: "deals", label: "Deal win rate", group: "Sales", measurement: "percentage", unit: "%", direction: "higher",
    compute: async (sb, u, r) => { const rows = await all(() => inR(sb.from("deals").select("status").eq("owner_id", u).in("status", ["won", "lost"]), "created_at", r)); return rows && pct(rows.filter(x => x.status === "won").length, rows.length); } },
  { key: "sales.quotes_sent", grant: "deals", label: "Quotes created", group: "Sales", measurement: "numeric", unit: "quotes", direction: "higher",
    compute: (sb, u, r) => count(inR(sb.from("quotes").select("id", { count: "exact", head: true }).eq("owner_id", u), "created_at", r)) },

  // ── Work delivery (development, design, marketing, any task-based role) ─────
  { key: "work.tasks_completed", grant: "work", label: "Tasks completed", group: "Work delivery", measurement: "numeric", unit: "tasks", direction: "higher",
    compute: (sb, u, r) => count(inR(sb.from("mkt_tasks").select("id", { count: "exact", head: true }).contains("assignees", [u]).not("completed_at", "is", null), "completed_at", r)) },
  { key: "work.tasks_assigned", grant: "work", label: "Tasks assigned", group: "Work delivery", measurement: "numeric", unit: "tasks", direction: "higher",
    compute: (sb, u, r) => count(inR(sb.from("mkt_tasks").select("id", { count: "exact", head: true }).contains("assignees", [u]), "created_at", r)) },
  { key: "work.on_time", grant: "work", label: "On-time delivery", group: "Work delivery", measurement: "percentage", unit: "%", direction: "higher",
    note: "Tasks completed in the period that had a due date: share finished on or before it.",
    compute: async (sb, u, r) => {
      const rows = await all(() => inR(sb.from("mkt_tasks").select("completed_at, due_date").contains("assignees", [u]).not("completed_at", "is", null).not("due_date", "is", null), "completed_at", r));
      return rows && pct(rows.filter(x => String(x.completed_at).slice(0, 10) <= String(x.due_date).slice(0, 10)).length, rows.length);
    } },
  { key: "work.overdue_open", grant: "work", label: "Overdue open tasks", group: "Work delivery", measurement: "numeric", unit: "tasks", direction: "lower",
    note: "A count as of now, not of the period.",
    compute: (sb, u, r) => count(sb.from("mkt_tasks").select("id", { count: "exact", head: true }).contains("assignees", [u]).is("completed_at", null).lt("due_date", r.to)) },
  { key: "work.hours_logged", grant: "work", label: "Hours logged", group: "Work delivery", measurement: "time", unit: "h", direction: "higher",
    compute: async (sb, u, r) => { const rows = await all(() => inDays(sb.from("mkt_time_entries").select("minutes").eq("user_id", u), "spent_on", r)); return rows && Math.round((sum(rows, x => x.minutes) / 60) * 10) / 10; } },

  // ── Customer support ───────────────────────────────────────────────────────
  { key: "support.tickets_resolved", grant: "tickets", label: "Tickets resolved", group: "Customer support", measurement: "numeric", unit: "tickets", direction: "higher",
    compute: (sb, u, r) => count(inR(sb.from("tickets").select("id", { count: "exact", head: true }).eq("assignee_id", u), "resolved_at", r)) },
  { key: "support.resolution_hours", grant: "tickets", label: "Average resolution time", group: "Customer support", measurement: "time", unit: "h", direction: "lower",
    compute: async (sb, u, r) => {
      const rows = await all(() => inR(sb.from("tickets").select("created_at, resolved_at").eq("assignee_id", u), "resolved_at", r));
      if (!rows || rows.length === 0) return rows && null;
      return Math.round((sum(rows, x => (new Date(x.resolved_at).getTime() - new Date(x.created_at).getTime()) / 3_600_000) / rows.length) * 10) / 10;
    } },
  { key: "support.sla_met", grant: "tickets", label: "SLA achievement", group: "Customer support", measurement: "percentage", unit: "%", direction: "higher",
    compute: async (sb, u, r) => { const rows = await all(() => inR(sb.from("tickets").select("sla_breached_at").eq("assignee_id", u), "resolved_at", r)); return rows && pct(rows.filter(x => !x.sla_breached_at).length, rows.length); } },

  // ── Finance ────────────────────────────────────────────────────────────────
  { key: "finance.invoices_raised", grant: "invoices", label: "Invoices processed", group: "Accounts & finance", measurement: "numeric", unit: "invoices", direction: "higher",
    compute: (sb, u, r) => count(inR(sb.from("invoices").select("id", { count: "exact", head: true }).eq("created_by", u), "created_at", r)) },
  { key: "finance.payments_received", grant: "invoices", label: "Payments received", group: "Accounts & finance", measurement: "currency", unit: "₹", direction: "higher",
    compute: async (sb, u, r) => { const rows = await all(() => inR(sb.from("invoices").select("amount").eq("created_by", u).eq("status", "paid"), "created_at", r)); return rows && sum(rows, x => x.amount); } },
  { key: "finance.outstanding", grant: "invoices", label: "Outstanding receivables", group: "Accounts & finance", measurement: "currency", unit: "₹", direction: "lower",
    compute: async (sb, u, r) => { const rows = await all(() => inR(sb.from("invoices").select("amount").eq("created_by", u).in("status", ["sent", "overdue"]), "created_at", r)); return rows && sum(rows, x => x.amount); } },

  // ── Field ──────────────────────────────────────────────────────────────────
  { key: "field.visits_completed", grant: "visits", label: "Visits completed", group: "Field", measurement: "numeric", unit: "visits", direction: "higher",
    compute: (sb, u, r) => count(inR(sb.from("visits").select("id", { count: "exact", head: true }).eq("owner_id", u).not("check_out_at", "is", null), "planned_at", r)) },

  // ── Attendance (any role) ──────────────────────────────────────────────────
  { key: "attendance.productive_hours", grant: "team", label: "Productive hours", group: "Attendance", measurement: "time", unit: "h", direction: "higher",
    compute: async (sb, u, r) => { const rows = await all(() => inDays(sb.from("attendance_log").select("productive_minutes").eq("agent_id", u), "date", r)); return rows && Math.round((sum(rows, x => x.productive_minutes) / 60) * 10) / 10; } },
  { key: "attendance.days_present", grant: "team", label: "Days present", group: "Attendance", measurement: "numeric", unit: "days", direction: "higher",
    compute: (sb, u, r) => count(inDays(sb.from("attendance_log").select("id", { count: "exact", head: true }).eq("agent_id", u), "date", r)) },
];

export const SOURCE_BY_KEY = new Map(KPI_SOURCES.map(s => [s.key, s]));

/** Actuals for the given keys. Unknown keys (manual KPIs) are left out; failures give null. */
export async function computeActuals(sb: any, userId: string, keys: string[], r: KpiRange): Promise<Record<string, number | null>> {
  const known = Array.from(new Set(keys)).filter(k => SOURCE_BY_KEY.has(k));
  const values = await Promise.all(known.map(k => SOURCE_BY_KEY.get(k)!.compute(sb, userId, r).catch(() => null)));
  return Object.fromEntries(known.map((k, i) => [k, values[i]]));
}
