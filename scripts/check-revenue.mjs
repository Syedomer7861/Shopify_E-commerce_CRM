#!/usr/bin/env node
/**
 * Smallest thing that fails if revenue figures drift: trials never count,
 * yearly is divided like the database does, a plan change is expansion not
 * churn, cancellations are churn, currencies never mix.
 * Run: node scripts/check-revenue.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "revenue");
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [join("node_modules", "typescript", "bin", "tsc"), "src/lib/revenue.ts",
  "--outDir", out, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck"], { stdio: "inherit" });
const R = createRequire(import.meta.url)(join(process.cwd(), out, "revenue.js"));

const sub = (o) => ({ status: "active", billing_cycle: "monthly", currency: "INR", trial_ends_at: null, current_period_end: "2027-01-01T00:00:00Z", cancelled_at: null, ...o });
const subs = [
  // org A: trial in Sept, converted on 1 Oct at 1,499/month, upgraded on 15 Nov to 2,999
  sub({ org_id: "A", status: "cancelled", price_minor: 149900, trial_ends_at: "2026-10-01T00:00:00Z", created_at: "2026-09-17T00:00:00Z", cancelled_at: "2026-10-01T00:00:00Z" }),
  sub({ org_id: "A", status: "cancelled", price_minor: 149900, created_at: "2026-10-01T00:00:00Z", cancelled_at: "2026-11-15T00:00:00Z" }),
  sub({ org_id: "A", price_minor: 299900, created_at: "2026-11-15T00:00:00Z" }),
  // org B: yearly 19,990 from August, cancelled 5 Nov
  sub({ org_id: "B", status: "cancelled", billing_cycle: "yearly", price_minor: 1999000, created_at: "2026-08-01T00:00:00Z", cancelled_at: "2026-11-05T00:00:00Z" }),
  // org C: new in November, USD
  sub({ org_id: "C", currency: "USD", price_minor: 4900, created_at: "2026-11-10T00:00:00Z" }),
  // org D: still on trial
  sub({ org_id: "D", status: "trialing", price_minor: 999900, trial_ends_at: "2026-12-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z" }),
];

assert.strictEqual(R.monthlyMinor(subs[3]), 166583, "yearly / 12 floored like SQL");
assert.deepStrictEqual(R.mrrAt(subs, new Date("2026-09-20T00:00:00Z")), { INR: 166583 }, "trial never counts");
assert.deepStrictEqual(R.mrrAt(subs, new Date("2026-10-20T00:00:00Z")), { INR: 149900 + 166583 });
const now = new Date("2026-11-20T00:00:00Z");
assert.deepStrictEqual(R.mrrAt(subs, now), { INR: 299900, USD: 4900 }, "currencies kept apart");

const m = R.movement(subs, R.monthStart(now), now);
assert.deepStrictEqual(m.INR, { start: 316483, new: 0, expansion: 150000, contraction: 0, churned: 166583, end: 299900 }, "upgrade = expansion, cancel = churn");
assert.deepStrictEqual(m.USD, { start: 0, new: 4900, expansion: 0, contraction: 0, churned: 0, end: 4900 });
const mv = Object.values(m.INR);
assert.strictEqual(m.INR.start + m.INR.new + m.INR.expansion - m.INR.contraction - m.INR.churned, m.INR.end, "movements reconcile");
assert.ok(mv.every(x => Number.isInteger(x) && x >= 0));

const series = R.mrrSeries(subs, now, 4);
assert.deepStrictEqual(series.map(s => s.month), ["2026-08", "2026-09", "2026-10", "2026-11"]);
assert.deepStrictEqual(series[2].mrr, { INR: 316483 }, "October closes with A and B");
assert.deepStrictEqual(series[3].mrr, { INR: 299900, USD: 4900 }, "current month uses now");
console.log("check-revenue: OK");
