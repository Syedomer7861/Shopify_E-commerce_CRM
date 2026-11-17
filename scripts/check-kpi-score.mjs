#!/usr/bin/env node
/**
 * Fails if KPI scoring rules drift: ratios, direction, caps, thresholds,
 * missing data (never silently zero) and weight validation.
 * Run: node scripts/check-kpi-score.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const js = ts.transpileModule(readFileSync("src/lib/kpi/score.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", "require", js)(mod, mod.exports, require_);
const { achievement, scorePlan, weightCheck, bandFor } = mod.exports;

const r = (o) => ({ key: "k", name: "k", measurement: "numeric", direction: "higher", target: 100, weight: 50, ...o });

// Ratios.
assert.strictEqual(achievement(r({}), 80), 80, "higher: actual/target");
assert.strictEqual(achievement(r({ direction: "lower", target: 4 }), 8), 50, "lower: target/actual");
assert.strictEqual(achievement(r({ direction: "lower", target: 4 }), 0), 120, "lower, zero actual = cap");
assert.strictEqual(achievement(r({}), 500), 120, "default cap 120");
assert.strictEqual(achievement(r({ cap: 100 }), 500), 100, "custom cap");
assert.strictEqual(achievement(r({}), -5), 0, "never negative");
assert.strictEqual(achievement(r({ threshold: 60 }), 50), 0, "below threshold scores 0");
assert.strictEqual(achievement(r({ threshold: 60 }), 70), 70, "above threshold kept");
// No usable target or actual = null, not 0.
assert.strictEqual(achievement(r({ target: 0 }), 10), null, "zero target");
assert.strictEqual(achievement(r({ target: null }), 10), null, "no target");
assert.strictEqual(achievement(r({}), null), null, "no actual");
assert.strictEqual(achievement(r({}), NaN), null, "NaN actual");
assert.strictEqual(achievement(r({ measurement: "boolean", target: null }), 1), 100, "boolean true");
assert.strictEqual(achievement(r({ measurement: "boolean", target: null }), 0), 0, "boolean false");

// Plan: missing excluded and renormalised; "zero" rule counts it.
const plan = [r({ key: "a", weight: 60 }), r({ key: "b", weight: 40 })];
let s = scorePlan(plan, { a: 90 });
assert.strictEqual(s.overall, 90, "missing item excluded, weights renormalised");
assert.strictEqual(s.coverage, 60);
assert.strictEqual(s.items[1].status, "missing");
assert.strictEqual(s.items[0].weighted, 54, "weighted = achievement × weight / 100");
s = scorePlan([r({ key: "a", weight: 60 }), r({ key: "b", weight: 40, missing: "zero" })], { a: 90 });
assert.strictEqual(s.overall, 54, "missing:zero counts as 0");
s = scorePlan(plan, {});
assert.strictEqual(s.overall, null, "nothing measured = no score");
assert.strictEqual(s.band, null);
s = scorePlan([r({ key: "a", target: null })], { a: 5 });
assert.strictEqual(s.items[0].status, "no_target");
assert.strictEqual(scorePlan(plan, { a: 100, b: 100 }).overall, 100);

// Weights and bands.
assert.deepStrictEqual(weightCheck([{ weight: 60 }, { weight: 40 }]), { total: 100, ok: true, invalid: false });
assert.strictEqual(weightCheck([{ weight: 60 }, { weight: 30 }]).ok, false);
assert.strictEqual(weightCheck([{ weight: -10 }, { weight: 110 }]).invalid, true);
assert.strictEqual(bandFor(100), "exceeds");
assert.strictEqual(bandFor(85), "meets");
assert.strictEqual(bandFor(60), "needs_improvement");
assert.strictEqual(bandFor(10), "below");

console.log("check-kpi-score: OK");
