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
const { issues, reps, stats, trail, matches, inRange, rangeStart, timeline, isLive, distanceM } = mod.exports;

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

const live = [
  { user_id: "a", lat: 17, lng: 78, accuracy_m: 10, sharing: true, started_at: ago(2), updated_at: ago(0.05) },
  { user_id: "b", lat: 17, lng: 78, accuracy_m: 10, sharing: true, started_at: ago(3), updated_at: ago(1) },
];
assert.ok(isLive(live[0], N) && !isLive(live[1], N), "fresh under 10 minutes only");
const tl = timeline(rows, live, N - 24 * 3_600_000, N);
const at = (k) => tl.find((e) => e.key === k);
assert.deepStrictEqual(tl.slice(0, 2).map((e) => e.key), ["p-upcoming", "lu-a"], "newest first; future plans on top");
assert.strictEqual(at("lu-a").title, "Live now");
assert.strictEqual(at("lu-b").title, "Last seen (signal lost)");
assert.ok(at("p-missed").title.startsWith("Missed"), "missed plan labelled");
assert.ok(at("p-upcoming").title.startsWith("Planned"), "future plan labelled");
assert.ok(!at("p-done"), "a checked-in visit has no plan event");
assert.strictEqual(at("o-blank").sub, "No outcome logged");
assert.ok(at("i-onsite").sub.includes("±400m"));
for (let i = 1; i < tl.length; i++) assert.ok(new Date(tl[i - 1].at) >= new Date(tl[i].at), "sorted");
const d = distanceM([17.385, 78.4867], [17.4065, 78.4772]);
assert.ok(d > 2500 && d < 2700, `Hyderabad ~2.6km, got ${d}`);

const { rangeBounds, matchesAdvanced, NO_ADVANCED, advancedCount } = mod.exports;
const [ys, ye] = rangeBounds("yesterday", now);
assert.strictEqual(ye - ys, 24 * 3_600_000);
assert.strictEqual(ye, rangeStart("today", now), "yesterday ends at today's midnight");
const [cs, ce] = rangeBounds("custom", now, "2026-11-17", "2026-11-10");
assert.strictEqual(new Date(cs).getDate(), 10, "swapped dates put in order");
assert.strictEqual(ce - cs, 8 * 24 * 3_600_000, "both days included");
assert.ok(inRange(rows[4], ys + 0, Infinity) && !inRange(v("x", { planned_at: ago(48) }), ys, ye));
const A = (o) => ({ ...NO_ADVANCED, ...o });
const ids = (a) => rows.filter((x) => matchesAdvanced(x, a)).map((x) => x.id);
assert.deepStrictEqual(ids(A({ q: "STUCK" })), ["stuck"], "search ignores case");
assert.deepStrictEqual(ids(A({ outcome: "missing" })), ["blank"], "missing = completed without outcome");
assert.deepStrictEqual(ids(A({ gps: "weak" })), ["onsite"]);
assert.deepStrictEqual(ids(A({ gps: "none" })), ["blank"], "checked in without GPS");
assert.deepStrictEqual(ids(A({ photo: "yes" })), []);
assert.strictEqual(advancedCount(A({ q: " ", gps: "weak" })), 1);

console.log("check-field-command: OK");
