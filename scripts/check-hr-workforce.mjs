#!/usr/bin/env node
/**
 * Smallest thing that fails if the HR workforce figures drift: inactive staff
 * excluded, leave counted only when approved and covering today, holidays not
 * held against attendance, anniversaries wrap the year end.
 * Run: node scripts/check-hr-workforce.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "hr-workforce");
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [join("node_modules", "typescript", "bin", "tsc"), "src/lib/hr-workforce.ts",
  "--outDir", out, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck"], { stdio: "inherit" });
const W = createRequire(import.meta.url)(join(process.cwd(), out, "hr-workforce.js"));

const today = new Date(2026, 11, 20); // 20 Dec 2026, a Sunday
const emp = [
  { id: "a", name: "A", joining_date: "2026-12-10", department: "Support", monthly_salary: 30000 },
  { id: "b", name: "B", joining_date: "2026-11-05", department: "Support", monthly_salary: 40000 },
  { id: "c", name: "C", joining_date: "2024-01-03", department: "", monthly_salary: null },
  { id: "d", name: "D", joining_date: "2020-12-25", department: "Ops", is_active: false },
];
const leaves = [
  { id: "1", agent_id: "a", start_date: "2026-12-19", end_date: "2026-12-21", status: "approved" },
  { id: "2", agent_id: "a", start_date: "2026-12-20", end_date: "2026-12-20", status: "approved" },
  { id: "3", agent_id: "b", start_date: "2026-12-20", end_date: "2026-12-22", status: "pending" },
  { id: "4", agent_id: "c", start_date: "2026-12-01", end_date: "2026-12-02", status: "approved" },
];
assert.deepStrictEqual(W.workforceKpis(emp, leaves, today), { total: 3, newHires: 1, newHiresPrev: 1, onLeaveToday: 1, pendingLeaves: 1 },
  "inactive excluded; leave counted once, only approved and covering today");

const att = [
  { agent_id: "a", date: "2026-12-14", status: "Present" },
  { agent_id: "a", date: "2026-12-15", status: "Late" },
  { agent_id: "a", date: "2026-12-16", status: "Half Day" },
  { agent_id: "a", date: "2026-12-17", status: "Absent" },
  { agent_id: "a", date: "2026-12-18", status: "Holiday" },
  { agent_id: "a", date: "2026-12-19", status: "Leave" },
];
const weeks = W.attendanceByWeek(att, today, 2);
assert.deepStrictEqual(weeks.map(w => w.week), ["2026-12-07", "2026-12-14"], "weeks start Monday");
assert.deepStrictEqual(weeks[1], { week: "2026-12-14", rate: 63, records: 4 }, "2.5 of 4 working records; holiday and leave skipped");
assert.strictEqual(weeks[0].rate, null, "no records = no rate, not 0%");

assert.deepStrictEqual(W.headcountByDepartment(emp), [{ department: "Support", count: 2 }, { department: "Unassigned", count: 1 }]);
const ann = W.upcomingAnniversaries(emp, today, 30);
assert.deepStrictEqual(ann.map(a => [a.id, a.date, a.years]), [["c", "2027-01-03", 3]], "wraps into next year; inactive and first-year skipped");
assert.deepStrictEqual(W.upcomingHolidays([{ id: "h", date: "2026-12-25", name: "Xmas" }, { id: "o", date: "2026-01-26", name: "Old" }], today).map(h => h.id), ["h"]);
assert.deepStrictEqual(W.payrollSummary(emp, { a: { status: "paid" }, d: { status: "paid" } }), { staff: 3, paid: 1, pending: 2, bill: 70000, missingSalary: 1 });
console.log("check-hr-workforce: OK");
