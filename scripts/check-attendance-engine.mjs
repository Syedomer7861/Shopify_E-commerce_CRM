#!/usr/bin/env node
/**
 * Smallest thing that fails if the attendance day-splitting or lateness
 * logic regresses. Run: node scripts/check-attendance-engine.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "attendance-engine");
mkdirSync(out, { recursive: true });

execFileSync(
  process.execPath,
  [
    join("node_modules", "typescript", "bin", "tsc"),
    "src/lib/attendance-engine.ts",
    "--outDir", out,
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--skipLibCheck",
  ],
  { stdio: "inherit" }
);

const require_ = createRequire(import.meta.url);
const { computeAutoAttendance } = require_(join(process.cwd(), out, "attendance-engine.js"));

// UTC timestamps for 09:00 IST, 14:00 IST etc. IST = UTC+5:30.
const ist = (dateUTC, hh, mm = 0) => {
  const d = new Date(`${dateUTC}T00:00:00.000Z`);
  d.setUTCHours(hh - 5, mm - 30, 0, 0);
  return d.toISOString();
};

// ── the actual bug being fixed: an interval spanning Mon-Fri must produce
// a record for every day in between, not just the day it started ──────────
{
  // Night-shift agent: online 9pm Monday, closes out 7am Tuesday. 10 hours,
  // comfortably inside the stale-session cap, but crosses one midnight with
  // no event exactly at the boundary - this is the actual shape of the bug:
  // the old code capped the interval at Monday 23:59:59 and never advanced,
  // so Tuesday's 00:00-07:00 segment was silently dropped.
  const rows = computeAutoAttendance(
    [
      { agent_id: "a1", status: "online", created_at: ist("2026-08-24", 21, 0) }, // Monday 9pm
      { agent_id: "a1", status: "offline", created_at: ist("2026-08-25", 7, 0) }, // Tuesday 7am
    ],
    [],
    { a1: "Night" }
  );
  const dates = rows.map((r) => r.date).sort();
  assert.deepStrictEqual(
    dates,
    ["2026-08-24", "2026-08-25"],
    "an interval crossing midnight must produce a record on both sides of the boundary"
  );
  for (const r of rows) {
    assert.ok(r.productive_minutes > 0, `${r.date} must have productive minutes`);
  }
}

// ── IST day boundary: a 1am IST clock-in is the previous UTC calendar day
// but must file under the correct IST date ─────────────────────────────────
{
  const rows = computeAutoAttendance(
    [
      { agent_id: "night1", status: "online", created_at: ist("2026-08-25", 1, 0) },
      { agent_id: "night1", status: "offline", created_at: ist("2026-08-25", 7, 0) },
    ],
    [],
    { night1: "Night" }
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].date, "2026-08-25", "must file under the IST calendar date, not the UTC one");
}

// ── lateness: Morning shift starts 09:00 IST, 15min grace ──────────────────
{
  const onTime = computeAutoAttendance(
    [
      { agent_id: "a2", status: "online", created_at: ist("2026-08-24", 9, 10) },
      { agent_id: "a2", status: "offline", created_at: ist("2026-08-24", 18, 0) },
    ],
    [],
    { a2: "Morning" }
  );
  assert.strictEqual(onTime[0].status, "Present", "10 min after shift start is within the 15 min grace");

  const late = computeAutoAttendance(
    [
      { agent_id: "a3", status: "online", created_at: ist("2026-08-24", 9, 45) },
      { agent_id: "a3", status: "offline", created_at: ist("2026-08-24", 18, 0) },
    ],
    [],
    { a3: "Morning" }
  );
  assert.strictEqual(late[0].status, "Late", "45 min after shift start must be Late despite a full day worked");
}

// ── half day and break-only exclusion ───────────────────────────────────────
{
  const halfDay = computeAutoAttendance(
    [
      { agent_id: "a4", status: "online", created_at: ist("2026-08-24", 9, 0) },
      { agent_id: "a4", status: "offline", created_at: ist("2026-08-24", 13, 0) }, // 4h
    ],
    [],
    { a4: "Morning" }
  );
  assert.strictEqual(halfDay[0].status, "Half Day");

  const breakOnly = computeAutoAttendance(
    [
      { agent_id: "a5", status: "break", created_at: ist("2026-08-24", 9, 0) },
      { agent_id: "a5", status: "offline", created_at: ist("2026-08-24", 10, 0) },
    ],
    [],
    { a5: "Morning" }
  );
  assert.strictEqual(breakOnly.length, 0, "a day with zero productive minutes must not be reported at all");
}

// ── manual entries always win over auto-computed ones ───────────────────────
{
  const rows = computeAutoAttendance(
    [
      { agent_id: "a6", status: "online", created_at: ist("2026-08-24", 9, 0) },
      { agent_id: "a6", status: "offline", created_at: ist("2026-08-24", 18, 0) },
    ],
    [{ agent_id: "a6", date: "2026-08-24", status: "Leave" }],
    { a6: "Morning" }
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].status, "Leave");
  assert.strictEqual(rows[0].is_auto, false);
}

// ── stale-session cap: nothing auto-closes an "online" status, so a
// forgotten laptop over a long weekend must not credit every day it spans ──
{
  const rows = computeAutoAttendance(
    [
      { agent_id: "a7", status: "online", created_at: ist("2026-08-21", 9, 0) }, // Friday
      { agent_id: "a7", status: "offline", created_at: ist("2026-08-24", 9, 0) }, // Monday, 3 days later
    ],
    [],
    { a7: "Morning" }
  );
  const dates = rows.map((r) => r.date).sort();
  // The 16h cap starts Friday 9am and runs out around Saturday 1am IST, so a
  // sliver of Saturday is expected and correct (a real night shift crossing
  // midnight should do the same). What must never happen is the gap running
  // all the way to Sunday or Monday - that would mean the cap did nothing.
  assert.ok(dates.includes("2026-08-21"), "Friday itself must still be credited");
  assert.ok(!dates.includes("2026-08-23"), "Sunday must not be credited from an uncapped stale session");
  assert.ok(!dates.includes("2026-08-24"), "Monday must not be credited from an uncapped stale session");
}

console.log("✓ attendance-engine: multi-day split, IST boundary, lateness, half-day, manual override, stale-session cap");
