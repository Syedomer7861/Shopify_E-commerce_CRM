#!/usr/bin/env node
/**
 * Smallest thing that fails if department overview figures drift: draft and
 * paid invoices not counted as owed, resolved tickets not counted as open or
 * breached, lead conversion only over decided leads, missed visits only once
 * the planned time has well passed.
 * Run: node scripts/check-dept-overview.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "dept-overview");
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [join("node_modules", "typescript", "bin", "tsc"), "src/lib/dept-overview.ts",
  "--outDir", out, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck"], { stdio: "inherit" });
const D = createRequire(import.meta.url)(join(process.cwd(), out, "dept-overview.js"));

const now = new Date(2026, 11, 20, 12); // 20 Dec 2026, noon local
const iso = (h) => new Date(now.getTime() + h * 3_600_000).toISOString();

const f = D.financeOverview(
  [
    { status: "Pending", amount: 100, category: "Travel", expense_date: "2026-12-02" },
    { status: "Approved", amount: 50, category: "Food", expense_date: "2026-12-05" },
    { status: "Approved", amount: 999, category: "Food", expense_date: "2026-11-30" },
    { status: "Rejected", amount: 70, category: "Food", expense_date: "2026-12-06" },
  ],
  [
    { direction: "receivable", amount: 1000, status: "sent", due_date: "2026-12-25" },
    { direction: "receivable", amount: 400, status: "sent", due_date: "2026-12-10" },
    { direction: "payable", amount: 300, status: "overdue", due_date: "2026-12-01" },
    { direction: "payable", amount: 9000, status: "draft", due_date: "2026-12-01" },
    { direction: "receivable", amount: 5000, status: "paid", due_date: "2026-12-01" },
  ], now);
assert.deepStrictEqual([f.pendingClaims, f.pendingClaimsValue, f.approvedThisMonth, f.receivable, f.payable, f.overdueCount, f.overdueValue],
  [1, 100, 50, 1400, 300, 2, 700], "drafts and paid not owed; past due counts as overdue");
assert.deepStrictEqual(f.claimsByCategory.map(c => [c.label, c.value]), [["Travel", 100], ["Food", 50]], "this month, rejected left out");

const s = D.serviceDeskOverview([
  { status: "open", sla_due_at: iso(-1), created_at: iso(-30), category: "IT", priority: "high" },
  { status: "in_progress", assignee_id: "x", sla_due_at: iso(2), created_at: iso(-3), category: "IT", priority: "normal" },
  { status: "resolved", sla_due_at: iso(-50), created_at: iso(-60), resolved_at: iso(-48), category: "HR", priority: "low" },
  { status: "closed", sla_due_at: iso(-10), created_at: iso(-20), resolved_at: iso(-16), category: "HR", priority: "low" },
], now);
assert.deepStrictEqual([s.open, s.unassigned, s.breached, s.dueSoon, s.resolved7, s.avgResolveHours, s.slaMet7],
  [2, 1, 1, 1, 2, 8, 50], "resolved tickets never open or breached; one closed late");

const l = D.salesOverview(
  [
    { status: "new", created_at: iso(-72), source: "Website" },
    { status: "new", created_at: iso(-5), source: "Website" },
    { status: "converted", created_at: iso(-24 * 40), source: "Referral" },
    { status: "lost", created_at: iso(-24 * 10), source: "" },
    { status: "lost", created_at: iso(-24 * 10), source: "Event" },
  ],
  [
    { status: "proposal", value: 1000, expected_close: "2026-12-28" },
    { status: "open", value: 500, expected_close: "2026-12-22" },
    { status: "won", value: 2000, expected_close: "2026-12-03" },
    { status: "won", value: 9000, expected_close: "2026-11-03" },
    { status: "lost", value: 700 },
  ], now);
assert.deepStrictEqual([l.newLeads30, l.notContacted, l.conversion, l.pipeline, l.openDeals, l.wonThisMonth, l.winRate],
  [4, 1, 33, 1500, 2, 2000, 67], "conversion over decided leads only");
assert.deepStrictEqual(l.closingSoon.map(d => d.value), [500, 1000]);
// A deal won on the 1st stays in this month in every time zone (date-only, not parsed as UTC).
assert.strictEqual(D.salesOverview([], [{ status: "won", value: 1, expected_close: "2026-12-01" }], now).wonThisMonth, 1);

const v = D.fieldOverview([
  { status: "planned", planned_at: iso(2) },
  { status: "planned", planned_at: iso(-2) },
  { status: "planned", planned_at: iso(-20) },
  { status: "checked_in", planned_at: iso(-1), check_in_at: iso(-1), check_in_lat: 1 },
  { status: "completed", planned_at: iso(-30), check_in_at: iso(-30), check_out_at: iso(-29), check_in_lat: 1 },
  { status: "cancelled", planned_at: iso(1) },
], now);
assert.deepStrictEqual([v.today, v.onSite, v.missed, v.completed7, v.completion30, v.withProof30],
  [3, 1, 1, 1, 50, 2], "a visit planned two hours ago is late, not missed");
assert.strictEqual(v.checkInsPerDay.at(-1).count, 1);
console.log("check-dept-overview: OK");
