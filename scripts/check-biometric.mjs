#!/usr/bin/env node
/**
 * Fails if eSSL punch parsing or biometric day rules drift.
 * Run: node scripts/check-biometric.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const load = (f) => {
  const js = ts.transpileModule(readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, require_);
  return mod.exports;
};
const { localToUtc, parseAttlog, parseLocalDateTime, dedupe } = load("src/lib/biometric.ts");
const { computeBiometricDays } = load("src/lib/attendance-engine.ts");

// IST device clock 09:05 is 03:35Z.
assert.equal(localToUtc("2026-11-18 09:05:00", 330), "2026-11-18T03:35:00.000Z");
assert.equal(localToUtc("2026-13-18 09:05:00", 330), null);
assert.equal(localToUtc("garbage", 330), null);

const att = parseAttlog("101\t2026-11-18 09:05:00\t0\t1\t0\n102\t2026-11-18 18:10:00\t1\t1\nbad line\n!!\t2026-11-18 09:00:00\t0", 330);
assert.equal(att.length, 2, "bad PIN and malformed lines are dropped");
assert.deepEqual(att[0], { employee_code: "101", punched_at: "2026-11-18T03:35:00.000Z", direction: "in" });
assert.equal(att[1].direction, "out");
assert.equal(dedupe([...att, att[0]]).length, 2);
assert.equal(parseAttlog("101\t2099-01-01 09:00:00\t0", 330).length, 0, "future device clock ignored");

// File import formats.
assert.equal(parseLocalDateTime("18/11/2026 09:05"), "2026-11-18 09:05:00");
assert.equal(parseLocalDateTime("18-Nov-2026", "6:10 PM"), "2026-11-18 18:10:00");
assert.equal(parseLocalDateTime("2026-11-18", "12:15 AM"), "2026-11-18 00:15:00");
assert.equal(parseLocalDateTime(new Date(Date.UTC(2026, 10, 18, 9, 5))), "2026-11-18 09:05:00");
assert.equal(parseLocalDateTime("18/11/2026", ""), null, "blank out-time is not a punch");
assert.equal(parseLocalDateTime("18/11/2026"), null, "date alone is not a punch");

// Days: full day on time, late, single punch.
const shift = { a: "Morning", b: "Morning", c: "Morning" };
const days = computeBiometricDays([
  { agent_id: "a", day: "2026-11-18", first_at: "2026-11-18T03:35:00Z", last_at: "2026-11-18T12:40:00Z", n: 4 }, // 09:05-18:10 IST
  { agent_id: "b", day: "2026-11-18", first_at: "2026-11-18T04:00:00Z", last_at: "2026-11-18T13:00:00Z", n: 2 }, // 09:30 IST
  { agent_id: "c", day: "2026-11-18", first_at: "2026-11-18T03:30:00Z", last_at: "2026-11-18T03:30:00Z", n: 1 },
], shift);
const by = Object.fromEntries(days.map((d) => [d.agent_id, d]));
assert.equal(by.a.status, "Present");
assert.equal(by.a.productive_minutes, 545);
assert.equal(by.b.status, "Late");
assert.equal(by.c.status, "Half Day");
assert.equal(by.c.clock_out, null, "single punch: no invented clock-out");
// Org timing override: Morning at 09:30 + 5 min grace makes b on time.
assert.equal(computeBiometricDays([{ agent_id: "b", day: "2026-11-18", first_at: "2026-11-18T04:00:00Z", last_at: "2026-11-18T13:00:00Z", n: 2 }], shift, { Morning: { start: 570, grace: 5 } })[0].status, "Present");

console.log("check-biometric: OK");
