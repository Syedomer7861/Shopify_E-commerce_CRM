#!/usr/bin/env node
/**
 * Smallest thing that fails if phone normalization regresses. Every write
 * path to customers.phone must produce the same string for the same real
 * number, or upsert-on-phone silently creates duplicate customers.
 * Run: node scripts/check-phone-utils.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "phone-utils");
mkdirSync(out, { recursive: true });

execFileSync(
  process.execPath,
  [
    join("node_modules", "typescript", "bin", "tsc"),
    "src/lib/phone-utils.ts",
    "--outDir", out,
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--skipLibCheck",
  ],
  { stdio: "inherit" }
);

const require_ = createRequire(import.meta.url);
const { normalizePhone } = require_(join(process.cwd(), out, "phone-utils.js"));

// All four historically-inconsistent write paths must converge here.
assert.strictEqual(normalizePhone("+917667724595"), "7667724595", "leading +91");
assert.strictEqual(normalizePhone("917667724595"), "7667724595", "leading 91, no plus");
assert.strictEqual(normalizePhone("7667724595"), "7667724595", "already 10 digits");
assert.strictEqual(normalizePhone("+91 76677 24595"), "7667724595", "spaces");
assert.strictEqual(normalizePhone("076-6772-4595"), "7667724595", "hyphens plus leading 0 (11 digits, keeps last 10)");
assert.strictEqual(normalizePhone(""), "", "empty string");
assert.strictEqual(normalizePhone(null), "", "null");
assert.strictEqual(normalizePhone(undefined), "", "undefined");
assert.strictEqual(normalizePhone("xxxxxxxxxx"), "", "fully masked -> no digits");
assert.strictEqual(normalizePhone(9876543210), "9876543210", "numeric input");

console.log("check-phone-utils: OK");
