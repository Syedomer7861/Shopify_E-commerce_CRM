#!/usr/bin/env node
/**
 * Smallest thing that fails if the SLA/benchmark math regresses.
 * Run: node scripts/check-hr-benchmark.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "hr-benchmark");
mkdirSync(out, { recursive: true });

execFileSync(
  process.execPath,
  [
    join("node_modules", "typescript", "bin", "tsc"),
    "src/lib/hr-benchmark.ts",
    "--outDir", out,
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--skipLibCheck",
  ],
  { stdio: "inherit" }
);

const require_ = createRequire(import.meta.url);
const { computeSlaWindow, gradeFromSla, computeBenchmark } = require_(join(process.cwd(), out, "hr-benchmark.js"));

const task = (status, dueDate, completedAt, createdAt) => ({
  status, due_date: dueDate, completed_at: completedAt, created_at: createdAt,
});

// computeSlaWindow: on-time vs late, ignores non-done/uncompleted tasks
{
  const tasks = [
    task("done", "2026-08-20", "2026-08-20T10:00:00Z", "2026-08-19T10:00:00Z"), // on time, 24h
    task("done", "2026-08-20", "2026-08-21T10:00:00Z", "2026-08-19T10:00:00Z"), // late, 48h
    task("pending", "2026-08-20", null, "2026-08-19T10:00:00Z"), // not done, excluded
  ];
  const r = computeSlaWindow(tasks);
  assert.strictEqual(r.doneCount, 2, "only done+completed tasks count");
  assert.strictEqual(r.onTimeCount, 1, "one on-time, one late");
  assert.strictEqual(r.slaPct, 50, "1/2 = 50%");
  assert.strictEqual(r.avgResolutionHours, 36, "avg of 24h and 48h");
}

// empty window -> zeros, not NaN/division-by-zero
{
  const r = computeSlaWindow([]);
  assert.deepStrictEqual(r, { doneCount: 0, onTimeCount: 0, slaPct: 0, avgResolutionHours: 0 });
}

// gradeFromSla thresholds
assert.strictEqual(gradeFromSla(96), "A+");
assert.strictEqual(gradeFromSla(95), "A+");
assert.strictEqual(gradeFromSla(94.9), "A");
assert.strictEqual(gradeFromSla(65), "C");
assert.strictEqual(gradeFromSla(10), "D");

// computeBenchmark: faster this week than last -> positive delta
{
  const current = [task("done", "2026-08-20", "2026-08-20T12:00:00Z", "2026-08-20T10:00:00Z")]; // 2h
  const prior = [task("done", "2026-08-13", "2026-08-13T14:00:00Z", "2026-08-13T10:00:00Z")]; // 4h
  const b = computeBenchmark(current, prior);
  assert.strictEqual(b.hasBaseline, true);
  assert.strictEqual(b.resolutionDeltaPct, 50, "resolving 2h vs 4h baseline = 50% faster");
  assert.strictEqual(b.resolutionDeltaMinutes, 120, "2h faster = 120 minutes");
}

// no prior-window data -> hasBaseline false, deltas zero (never fabricate a trend)
{
  const current = [task("done", "2026-08-20", "2026-08-20T12:00:00Z", "2026-08-20T10:00:00Z")];
  const b = computeBenchmark(current, []);
  assert.strictEqual(b.hasBaseline, false);
  assert.strictEqual(b.resolutionDeltaPct, 0);
  assert.strictEqual(b.resolutionDeltaMinutes, 0);
}

console.log("check-hr-benchmark: OK");
