"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { can } from "@/lib/access";
import { financeOverview, fieldOverview, salesOverview, serviceDeskOverview } from "@/lib/dept-overview";
import { BarList, DayBars, Kpi, MiniList, Panel, rupees, shortDay } from "@/components/overview/Cards";

type Row = Record<string, any>;
// ponytail: newest 2000 rows per table is plenty for these totals; move to a summary RPC if a team outgrows it.
const CAP = 2000;

/**
 * Rows for an overview, read as the signed-in user so row security decides
 * whose records are counted. Skipped (empty) when the viewer can't see the module.
 */
function useRows(table: string, module: string, cols: string): Row[] | null {
  const { profile } = useCurrentProfile();
  const allowed = !!profile && can(profile, module, "view") !== null;
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    if (!profile) return;
    if (!allowed) { setRows([]); return; }
    let live = true;
    createClient().from(table).select(cols).order("created_at", { ascending: false }).limit(CAP)
      .then(({ data, error }) => { if (live) setRows(error ? [] : (data as unknown as Row[]) || []); });
    return () => { live = false; };
  }, [table, cols, allowed, profile]);
  return rows;
}

const grid4 = "grid grid-cols-2 lg:grid-cols-4 gap-4";
const Loading = () => <div className="h-28 mb-6 rounded-2xl bg-gray-50 animate-pulse" aria-label="Loading overview" />;
const days = (iso: string) => Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
const dueTag = (d: string) => { const n = days(d); return n < 0 ? `${-n}d overdue` : n === 0 ? "Due today" : `In ${n}d`; };

export function FinanceOverview() {
  const expenses = useRows("expenses", "expenses", "id, amount, category, status, expense_date, created_at");
  const invoices = useRows("invoices", "invoices", "id, number, direction, party_name, amount, due_date, status, created_at");
  const v = useMemo(() => expenses && invoices ? financeOverview(expenses, invoices, new Date()) : null, [expenses, invoices]);
  if (!v) return <Loading />;
  return (
    <div className="space-y-6 mb-8">
      <div className={grid4}>
        <Kpi label="Claims awaiting approval" value={v.pendingClaims} sub={`${rupees(v.pendingClaimsValue)} claimed`} href="/approvals" warn={v.pendingClaims > 0} />
        <Kpi label="Approved claims, this month" value={rupees(v.approvedThisMonth)} sub="By expense date" />
        <Kpi label="To receive" value={rupees(v.receivable)} sub={`To pay: ${rupees(v.payable)}`} />
        <Kpi label="Overdue invoices" value={v.overdueCount} sub={`${rupees(v.overdueValue)} past due date`} warn={v.overdueCount > 0} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Claims by category" note="This month, approved and pending">
          <BarList rows={v.claimsByCategory} by="value" show={r => rupees(r.value)} empty="No claims this month." />
        </Panel>
        <Panel title="Invoices due next" note="Sent or overdue, not yet paid">
          <MiniList empty="Nothing due." rows={v.dueNext.map(i => ({
            id: i.id, title: `${i.number} · ${i.party_name || "—"}`, sub: `${i.direction === "payable" ? "To pay" : "To receive"} ${rupees(Number(i.amount))}`,
            tag: dueTag(i.due_date), warn: days(i.due_date) < 0,
          }))} />
        </Panel>
      </div>
    </div>
  );
}

export function ServiceDeskOverview() {
  const tickets = useRows("tickets", "tickets", "id, category, priority, status, assignee_id, sla_due_at, resolved_at, created_at");
  const v = useMemo(() => tickets ? serviceDeskOverview(tickets, new Date()) : null, [tickets]);
  if (!v) return <Loading />;
  return (
    <div className="space-y-6 mb-8">
      <div className={grid4}>
        <Kpi label="Open tickets" value={v.open} sub={`${v.unassigned} not yet taken`} />
        <Kpi label="Past SLA" value={v.breached} sub={`${v.dueSoon} more due within 4 hours`} warn={v.breached > 0} />
        <Kpi label="Resolved, 7 days" value={v.resolved7} sub={v.avgResolveHours === null ? "No resolutions yet" : `Average ${v.avgResolveHours} h to resolve`} />
        <Kpi label="SLA met, 7 days" value={v.slaMet7 === null ? "—" : `${v.slaMet7}%`} sub="Of tickets resolved this week" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Panel title="Tickets raised" note="Per day, last 14 days" className="xl:col-span-3">
          <DayBars days={v.raisedPerDay} label="Tickets raised per day" empty="No tickets in the last 14 days." />
        </Panel>
        <Panel title="Open by category" className="xl:col-span-2">
          <BarList rows={v.openByCategory} empty="No open tickets." />
          <div className="flex gap-2 flex-wrap mt-5">
            {v.openByPriority.map(p => <span key={p.label} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-50 capitalize">{p.label} {p.count}</span>)}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function SalesOverview() {
  const leads = useRows("leads", "leads", "id, status, source, created_at");
  const deals = useRows("deals", "deals", "id, title, value, status, expected_close, created_at");
  const v = useMemo(() => leads && deals ? salesOverview(leads, deals, new Date()) : null, [leads, deals]);
  if (!v) return <Loading />;
  return (
    <div className="space-y-6 mb-8">
      <div className={grid4}>
        <Kpi label="New leads, 30 days" value={v.newLeads30} sub={`${v.notContacted} not contacted after 2 days`} warn={v.notContacted > 0} />
        <Kpi label="Lead conversion" value={v.conversion === null ? "—" : `${v.conversion}%`} sub="Converted, of leads won or lost" />
        <Kpi label="Open pipeline" value={rupees(v.pipeline)} sub={`${v.openDeals} open deals`} />
        <Kpi label="Won this month" value={rupees(v.wonThisMonth)} sub={v.winRate === null ? "No closed deals yet" : `Win rate ${v.winRate}%`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Pipeline by stage" note="Open deal value">
          <BarList rows={v.byStage} by="value" show={r => `${rupees(r.value)} · ${r.count}`} empty="No open deals." />
        </Panel>
        <Panel title="Leads by source" note="Last 30 days">
          <BarList rows={v.leadsBySource} empty="No leads in the last 30 days." />
        </Panel>
        <Panel title="Closing soon" note="Open deals by expected close">
          <MiniList empty="No close dates set." rows={v.closingSoon.map(d => ({
            id: d.id, title: d.title, sub: rupees(Number(d.value)), tag: dueTag(d.expected_close), warn: days(d.expected_close) < 0,
          }))} />
        </Panel>
      </div>
    </div>
  );
}

export function FieldOverview() {
  const visits = useRows("visits", "visits", "id, party_name, purpose, status, planned_at, check_in_at, check_out_at, check_in_lat, created_at");
  const v = useMemo(() => visits ? fieldOverview(visits, new Date()) : null, [visits]);
  if (!v) return <Loading />;
  return (
    <div className="space-y-6 mb-8">
      <div className={grid4}>
        <Kpi label="Visits today" value={v.today} sub={`${v.onSite} checked in right now`} />
        <Kpi label="Missed" value={v.missed} sub="Still planned 12+ hours after the time" warn={v.missed > 0} />
        <Kpi label="Completed, 7 days" value={v.completed7} sub="Checked out with an outcome" />
        <Kpi label="Visit completion, 30 days" value={v.completion30 === null ? "—" : `${v.completion30}%`} sub={`${v.withProof30} with location proof`} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Panel title="Check-ins" note="Per day, last 14 days" className="xl:col-span-3">
          <DayBars days={v.checkInsPerDay} label="Check-ins per day" empty="No check-ins in the last 14 days." />
        </Panel>
        <Panel title="Coming up" className="xl:col-span-2">
          <MiniList empty="No visits planned." rows={v.upcoming.map(x => ({
            id: x.id, title: x.party_name, sub: x.purpose || undefined,
            tag: `${shortDay(x.planned_at)} ${new Date(x.planned_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
          }))} />
        </Panel>
      </div>
    </div>
  );
}
