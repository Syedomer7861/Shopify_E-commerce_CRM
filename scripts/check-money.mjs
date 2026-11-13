#!/usr/bin/env node
/**
 * Smallest thing that fails if price parsing regresses. Owner-entered prices
 * become whole paise in the database; a float slip here mis-prices a plan.
 * Run: node scripts/check-money.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "money");
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [join("node_modules", "typescript", "bin", "tsc"), "src/lib/money.ts",
  "--outDir", out, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck"], { stdio: "inherit" });

const { toMinor } = createRequire(import.meta.url)(join(process.cwd(), out, "money.js"));
assert.strictEqual(toMinor("1499"), 149900);
assert.strictEqual(toMinor("1499.5"), 149950);
assert.strictEqual(toMinor("1499.05"), 149905);
assert.strictEqual(toMinor("0.29"), 29, "no float drift (0.29*100 = 28.999...)");
assert.strictEqual(toMinor(" 1,499.99 "), 149999);
assert.strictEqual(toMinor("0"), 0);
for (const bad of ["", "-5", "1.999", "abc", "1e3", "12.", ".5"]) assert.strictEqual(toMinor(bad), null, `rejects "${bad}"`);
console.log("check-money: OK");
