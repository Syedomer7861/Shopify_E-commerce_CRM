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
assert.equal(by.c.status, "Present", "single on-time punch is Present, not Half Day");
assert.equal(by.c.missing_out, true);
assert.equal(by.c.clock_out, null, "single punch: no invented clock-out");
assert.equal(by.b.late_by_minutes, 15, "09:30 vs 09:00+15 grace");
// Late single punch, double-tap at the door, and a short in+out day.
const more = Object.fromEntries(computeBiometricDays([
  { agent_id: "d", day: "2026-11-18", first_at: "2026-11-18T04:30:00Z", last_at: "2026-11-18T04:30:00Z", n: 1 }, // 10:00 IST
  { agent_id: "e", day: "2026-11-18", first_at: "2026-11-18T03:30:00Z", last_at: "2026-11-18T03:40:00Z", n: 2 }, // 10 min apart
  { agent_id: "f", day: "2026-11-18", first_at: "2026-11-18T03:30:00Z", last_at: "2026-11-18T07:30:00Z", n: 2 }, // 4h
], { d: "Morning", e: "Morning", f: "Morning" }).map((r) => [r.agent_id, r]));
assert.equal(more.d.status, "Late");
assert.equal(more.d.missing_out, true);
assert.equal(more.e.missing_out, true, "two punches 10 min apart = no out-punch");
assert.equal(more.e.status, "Present");
assert.equal(more.f.status, "Half Day");
assert.equal(more.f.missing_out, false);
// CRM-log days stop counting once the person has device punches.
const { computeAutoAttendance } = load("src/lib/attendance-engine.ts");
const bio = computeBiometricDays([{ agent_id: "a", day: "2026-11-10", first_at: "2026-11-10T03:30:00Z", last_at: "2026-11-10T12:30:00Z", n: 2 }], shift);
const merged = computeAutoAttendance([
  { agent_id: "a", status: "Online", created_at: "2026-11-05T04:00:00Z" },
  { agent_id: "a", status: "Offline", created_at: "2026-11-05T05:00:00Z" },
  { agent_id: "a", status: "Online", created_at: "2026-11-12T04:00:00Z" },
  { agent_id: "a", status: "Offline", created_at: "2026-11-12T05:00:00Z" },
], [], shift, {}, bio);
const dates = merged.map((r) => r.date).sort();
assert.ok(!dates.includes("2026-11-12"), "CRM-log day after first punch dropped");
assert.ok(dates.includes("2026-11-10"));
assert.ok(dates.includes("2026-11-05"), "CRM-log day before first punch kept");
// Org timing override: Morning at 09:30 + 5 min grace makes b on time.
assert.equal(computeBiometricDays([{ agent_id: "b", day: "2026-11-18", first_at: "2026-11-18T04:00:00Z", last_at: "2026-11-18T13:00:00Z", n: 2 }], shift, { Morning: { start: 570, grace: 5 } })[0].status, "Present");

// Org policy rules.
const eng = load("src/lib/attendance-engine.ts");
const P = eng.policyFromRow({ weekly_off: [0], saturday_rule: "half", full_day_minutes: 480, half_day_minutes: 120, missed_punch: "half_day", very_late_minutes: 60, lates_per_half_day: 3 });
const day = (id, date, fromZ, toZ, n = 2) => ({ agent_id: id, day: date, first_at: `${date}T${fromZ}Z`, last_at: `${date}T${toZ}Z`, n });
const pol = Object.fromEntries(eng.computeBiometricDays([
  day("sat", "2026-11-14", "03:30:00", "07:45:00"),       // Sat 09:00-13:15 IST: 4h15 >= half of 8h
  day("wk7h", "2026-11-13", "03:30:00", "10:30:00"),      // Fri 7h < 8h full day
  day("short", "2026-11-13", "03:30:00", "04:30:00"),     // 1h < 2h minimum
  day("miss", "2026-11-13", "03:30:00", "03:30:00", 1),   // missed out-punch
  day("vlate", "2026-11-13", "05:30:00", "13:30:00"),     // 11:00 IST, 105 min late
], {}, {}, P).map((r) => [r.agent_id, r]));
assert.equal(pol.sat.status, "Present", "half-day Saturday needs only half the hours");
assert.equal(pol.wk7h.status, "Half Day");
assert.equal(pol.short.status, "Absent");
assert.equal(pol.miss.status, "Half Day");
assert.equal(pol.vlate.status, "Half Day", "very late arrival is a half day");
assert.equal(eng.isWeeklyOff("2026-11-15", P), true, "Sunday off");
assert.equal(eng.isWeeklyOff("2026-11-14", eng.policyFromRow({ saturday_rule: "alt_2_4_off" })), true, "14 Nov is the 2nd Saturday");
assert.equal(eng.isWeeklyOff("2026-11-07", eng.policyFromRow({ saturday_rule: "alt_2_4_off" })), false);
assert.equal(eng.lateDeductions(7, P), 2);
assert.deepEqual(eng.policyFromRow({ weekly_off: [9, "x", 6], full_day_minutes: 5 }).weeklyOff, [6], "bad weekdays dropped");
assert.equal(eng.policyFromRow({ full_day_minutes: 5 }).fullDayMinutes, 60, "clamped");
assert.equal(eng.computeBiometricDays([day("x", "2026-11-13", "03:30:00", "03:30:00", 1)], {}, {}).at(0).status, "Present", "default policy unchanged");

console.log("check-biometric: OK");
