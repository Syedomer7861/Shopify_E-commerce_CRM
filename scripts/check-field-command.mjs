#!/usr/bin/env node
/**
 * Fails if the field command rules (missed, still on site, needs-you list,
 * per-rep counts, map trail) drift. Run: node scripts/check-field-command.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const js = ts.transpileModule(readFileSync("src/lib/field-command.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", "require", js)(mod, mod.exports, require_);
const { issues, reps, stats, trail, matches, inRange, rangeStart } = mod.exports;

const now = new Date("2026-11-18T15:00:00");
const N = now.getTime();
const ago = (h) => new Date(N - h * 3_600_000).toISOString();
const v = (id, o) => ({ id, party_name: id, purpose: null, status: "planned", planned_at: ago(1), check_in_at: null, check_out_at: null,
  check_in_lat: null, check_in_lng: null, check_in_accuracy_m: null, outcome: null, owner_id: "a", created_at: ago(1), ...o });

const rows = [
  v("missed", { planned_at: ago(13) }),
  v("upcoming", { planned_at: ago(-2) }),
  v("stuck", { status: "checked_in", check_in_at: ago(5), check_in_lat: 17.1, check_in_lng: 78.1, owner_id: "b" }),
  v("onsite", { status: "checked_in", check_in_at: ago(1), check_in_lat: 17.2, check_in_lng: 78.2, check_in_accuracy_m: 400 }),
  v("done", { status: "completed", planned_at: ago(4), check_in_at: ago(3), check_out_at: ago(2), check_in_lat: 17.0, check_in_lng: 78.0, outcome: "Order placed" }),
  v("blank", { status: "completed", planned_at: ago(6), check_in_at: ago(5.5), check_out_at: ago(5), outcome: "  ", owner_id: "b" }),
];

const kinds = issues(rows, N).map((i) => `${i.kind}:${i.visit.id}`);
assert.deepStrictEqual(kinds, ["missed:missed", "long_on_site:stuck", "no_outcome:blank", "weak_location:onsite"]);

assert.ok(matches(rows[0], "missed", N) && !matches(rows[0], "planned", N), "missed is not also planned");
assert.ok(matches(rows[1], "planned", N));
assert.ok(matches(rows[2], "on_site", N) && matches(rows[4], "done", N));

const r = Object.fromEntries(reps(rows, N).map((x) => [x.id, x]));
assert.strictEqual(r.a.visits, 4); assert.strictEqual(r.a.onSite, 1); assert.strictEqual(r.a.missed, 1); assert.strictEqual(r.a.done, 1);
assert.strictEqual(r.a.last.id, "onsite", "latest check-in wins");
assert.strictEqual(r.b.visits, 2);

const s = stats(rows, N);
assert.strictEqual(s.onSite, 2); assert.strictEqual(s.done, 2); assert.strictEqual(s.missed, 1);
assert.strictEqual(s.completion, 40, "2 done of 5 due (upcoming is not due yet)");
assert.strictEqual(s.avgStayMin, 45);
assert.strictEqual(s.proof, 75, "3 of 4 check-ins carry a location");

assert.deepStrictEqual(trail(rows, "a"), [[17.0, 78.0], [17.2, 78.2]], "trail in check-in order, no-coordinate rows skipped");

const start = rangeStart("today", now);
assert.ok(inRange(rows[1], start) && !inRange(v("old", { planned_at: ago(48) }), start));

console.log("check-field-command: OK");
