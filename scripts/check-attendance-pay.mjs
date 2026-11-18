#!/usr/bin/env node
/**
 * Fails if attendance-based pay (paid days, LOP, earned salary) drifts.
 * Run: node scripts/check-attendance-pay.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const cache = {};
const load = (f) => {
  if (cache[f]) return cache[f];
  const js = ts.transpileModule(readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  const req = (id) => (id.startsWith("@/lib/") ? load(`src/lib/${id.slice(6)}.ts`) : require_(id));
  new Function("module", "exports", "require", js)(mod, mod.exports, req);
  return (cache[f] = mod.exports);
};
const { computeMonthPay } = load("src/lib/attendance-pay.ts");
const { policyFromRow } = load("src/lib/attendance-engine.ts");

// November 2026: 30 days, Sundays 1, 8, 15, 22, 29. Month finished.
const days = (from, to, status) => Array.from({ length: to - from + 1 }, (_, i) => ({ date: `2026-11-${String(from + i).padStart(2, "0")}`, status }));
const workdays = (status) => Array.from({ length: 30 }, (_, i) => i + 1)
  .filter((d) => ![1, 8, 15, 22, 29].includes(d))
  .map((d) => ({ date: `2026-11-${String(d).padStart(2, "0")}`, status }));
const base = { month: "2026-11", today: "2026-12-05", monthlySalary: 30000, holidays: [], approvedLeaves: [] };

let r = computeMonthPay({ ...base, attendance: workdays("Present") });
assert.equal(r.paidDays, 30, "full attendance + Sundays = 30 paid days");
assert.equal(r.earned, 30000);
assert.equal(r.net, 30000 - Math.round(15000 * 0.12) - 200);
assert.equal(r.inProgress, false);

// Two absents, one half day, one unmarked working day.
const att = workdays("Present").filter((a) => a.date !== "2026-11-10");
att.find((a) => a.date === "2026-11-02").status = "Absent";
att.find((a) => a.date === "2026-11-03").status = "Absent";
att.find((a) => a.date === "2026-11-04").status = "Half Day";
r = computeMonthPay({ ...base, attendance: att });
assert.equal(r.unmarked, 1);
assert.equal(r.paidDays, 26.5);
assert.equal(r.lopDays, 3.5);
assert.equal(r.earned, Math.round(30000 * 26.5 / 30));

// Approved leave and a holiday cover unmarked days; adjustment adds back.
r = computeMonthPay({ ...base, attendance: att, approvedLeaves: [{ start_date: "2026-11-10", end_date: "2026-11-10" }], holidays: ["2026-11-02"] , adjustDays: 0.5 });
assert.equal(r.leave, 1);
assert.equal(r.paidDays, 26.5 + 1 + 0.5, "Absent mark beats the holiday list; leave + adjust count");

// Joined mid-month: earlier days unpaid and not LOP.
r = computeMonthPay({ ...base, joiningDate: "2026-11-16", attendance: workdays("Present").filter((a) => a.date >= "2026-11-16") });
assert.equal(r.beforeJoining, 15);
assert.equal(r.paidDays, 15);
assert.equal(r.lopDays, 0);
assert.equal(r.earned, 15000);

// Late penalty from org rules: 6 lates, every 3 = half day cut.
const P = policyFromRow({ lates_per_half_day: 3 });
r = computeMonthPay({ ...base, policy: P, attendance: workdays("Present").map((a, i) => (i < 6 ? { ...a, status: "Late" } : a)) });
assert.equal(r.lateCuts, 2);
assert.equal(r.paidDays, 29);

// Running month: days not over yet are assumed paid.
r = computeMonthPay({ ...base, today: "2026-11-18", attendance: days(2, 7, "Present") });
assert.equal(r.inProgress, true);
assert.equal(r.unmarked, 8, "9-14, 16-17 unmarked working days before today");

// No salary set = zero pay, never negative.
r = computeMonthPay({ ...base, monthlySalary: 0, attendance: [] });
assert.equal(r.net, 0);
assert.equal(computeMonthPay({ ...base, attendance: [], adjustDays: 99 }).paidDays, 30, "adjust capped at month length");

console.log("check-attendance-pay: OK");
