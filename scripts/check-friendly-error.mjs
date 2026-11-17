#!/usr/bin/env node
/**
 * Fails if error toasts start leaking raw database text again, or if an
 * unknown message stops passing through untouched.
 * Run: node scripts/check-friendly-error.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "friendly-error");
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [join("node_modules", "typescript", "bin", "tsc"), "src/lib/friendly-error.ts",
  "--outDir", out, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck"], { stdio: "inherit" });

const { friendlyError: f } = createRequire(import.meta.url)(join(process.cwd(), out, "friendly-error.js"));
assert.match(f('new row violates row-level security policy for table "orders"'), /permission/);
assert.match(f('duplicate key value violates unique constraint "x_key"'), /already exists/);
assert.strictEqual(f('null value in column "customer_id" violates not-null constraint'), "Please fill in customer.");
assert.match(f("TypeError: Failed to fetch"), /internet/);
assert.match(f("JWT expired"), /sign in again/);
assert.strictEqual(f("Unmasking failed: permission denied for table orders"), "Unmasking failed: You don't have permission to do that. Ask an admin if you need access.");
assert.strictEqual(f("Pick a branch first"), "Pick a branch first", "unknown text passes through");
assert.strictEqual(f(""), "");
console.log("check-friendly-error: OK");
