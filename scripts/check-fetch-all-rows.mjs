#!/usr/bin/env node
/**
 * Smallest thing that fails if report paging breaks: every row comes back past
 * the 1,000-row cap, the cap is honoured, errors stop the loop, count survives.
 * Run: node scripts/check-fetch-all-rows.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "fetch-all-rows");
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [join("node_modules", "typescript", "bin", "tsc"), "src/lib/fetch-all-rows.ts",
  "--outDir", out, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck"], { stdio: "inherit" });
const { fetchAllRows } = createRequire(import.meta.url)(join(process.cwd(), out, "fetch-all-rows.js"));

// Fake PostgREST builder over n rows; never returns more than 1,000 per call.
function fake(n, { failAt = -1 } = {}) {
  const calls = [];
  const b = {
    orders: [],
    order(c) { b.orders.push(c); return b; },
    range(from, to) {
      calls.push([from, to]);
      if (from === failAt) return Promise.resolve({ data: null, error: { message: "boom" } });
      const end = Math.min(to + 1, n, from + 1000);
      const data = Array.from({ length: Math.max(0, end - from) }, (_, i) => ({ id: from + i }));
      return Promise.resolve({ data, error: null, count: from === 0 ? n : null });
    },
  };
  return { b, calls };
}

let f = fake(2059);
let r = await fetchAllRows(f.b);
assert.strictEqual(r.data.length, 2059, "all rows past the 1,000 cap");
assert.strictEqual(new Set(r.data.map((x) => x.id)).size, 2059, "no repeats");
assert.strictEqual(r.count, 2059, "count from first page kept");
assert.strictEqual(r.truncated, false);
assert.deepStrictEqual(f.b.orders, ["id"], "id tie-breaker added");

f = fake(1000);
r = await fetchAllRows(f.b);
assert.strictEqual(r.data.length, 1000);
assert.strictEqual(f.calls.length, 2, "exact multiple needs one empty page");

f = fake(5000);
r = await fetchAllRows(f.b, 2500);
assert.strictEqual(r.data.length, 2500, "max honoured");
assert.strictEqual(r.truncated, true);

f = fake(3000, { failAt: 1000 });
r = await fetchAllRows(f.b);
assert.ok(r.error, "error surfaced");
assert.strictEqual(r.data.length, 1000, "stops at the failing page");

console.log("check-fetch-all-rows: OK");
