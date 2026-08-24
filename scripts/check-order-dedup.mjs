#!/usr/bin/env node
/**
 * Smallest thing that fails if order-merge matching regresses. A wrong
 * merge here deletes a real order row, so ambiguous/no-match must never
 * silently pick a candidate. Run: node scripts/check-order-dedup.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "order-dedup");
mkdirSync(out, { recursive: true });

execFileSync(
  process.execPath,
  [
    join("node_modules", "typescript", "bin", "tsc"),
    "src/lib/order-dedup.ts",
    "--outDir", out,
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--skipLibCheck",
  ],
  { stdio: "inherit" }
);

const require_ = createRequire(import.meta.url);
const { isSuspectOrderId, findMergeCandidate } = require_(join(process.cwd(), out, "order-dedup.js"));

// isSuspectOrderId
assert.strictEqual(isSuspectOrderId("21412"), false, "pure digits -> not suspect");
assert.strictEqual(isSuspectOrderId("6a8bf01c240c3"), true, "hex fragment -> suspect");
assert.strictEqual(isSuspectOrderId(null), false, "null -> not suspect");
assert.strictEqual(isSuspectOrderId(""), false, "empty -> not suspect");

const mkOrder = (id, shopifyId, hoursAgo, items) => ({
  id,
  shopify_order_id: shopifyId,
  ordered_at: new Date(Date.parse("2026-08-24T12:00:00Z") - hoursAgo * 3_600_000).toISOString(),
  line_items: items.map(name => ({ name })),
});

// Clean single match: same item, within window -> merges
{
  const suspect = mkOrder("s1", "6a8bf01c240c3", 0, ["Mate - Men's Power Capsules"]);
  const golden = mkOrder("g1", "21412", 1, ["Mate - Men's Power Capsules"]);
  const other = mkOrder("g2", "21400", 200, ["Unrelated Product"]);
  const result = findMergeCandidate(suspect, [golden, other]);
  assert.strictEqual(result?.id, "g1", "single in-window item-overlap match merges");
}

// No item overlap -> no match, even if close in time
{
  const suspect = mkOrder("s2", "abc123", 0, ["Product A"]);
  const notMatching = mkOrder("g3", "21500", 1, ["Product B"]);
  const result = findMergeCandidate(suspect, [notMatching]);
  assert.strictEqual(result, null, "no item overlap -> no merge");
}

// Outside 72h window -> no match even with item overlap
{
  const suspect = mkOrder("s3", "def456", 0, ["Product C"]);
  const tooOld = mkOrder("g4", "21600", 100, ["Product C"]);
  const result = findMergeCandidate(suspect, [tooOld]);
  assert.strictEqual(result, null, "outside 72h window -> no merge");
}

// Two equally-valid candidates -> ambiguous, must NOT pick one
{
  const suspect = mkOrder("s4", "ghi789", 0, ["Shared Item"]);
  const a = mkOrder("g5", "21700", 1, ["Shared Item"]);
  const b = mkOrder("g6", "21701", 2, ["Shared Item"]);
  const result = findMergeCandidate(suspect, [a, b]);
  assert.strictEqual(result, null, "ambiguous (2 candidates) -> never auto-picks one");
}

console.log("check-order-dedup: OK");
