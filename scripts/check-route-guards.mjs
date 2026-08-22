#!/usr/bin/env node
/**
 * Fails if any API route handler is reachable without an auth check.
 * Run: node scripts/check-route-guards.mjs
 *
 * ponytail: static grep, not a runtime test. It catches the regression that
 * actually happens (a new route ships with no guard); it does not prove the
 * guards themselves are correct.
 */
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import assert from "node:assert";

const API_DIR = "src/app/api";

// Routes that are intentionally reachable without a session or shared secret.
const ALLOWED_PUBLIC = new Set([
  "auth/google/route.ts",        // starts the OAuth redirect
  "auth/google/callback/route.ts", // OAuth callback, validated by state/code
]);

// Any one of these in a file counts as a guard.
const GUARDS = [
  "requireInternal",
  "hasInternalSecret",
  "getAuthenticatedSession",
  "ensureAdmin",
  "SHOPIFY_WEBHOOK_SECRET",   // webhook: HMAC verified instead of a session
  "SHIPROCKET_WEBHOOK_TOKEN",
];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const unguarded = walk(API_DIR)
  .filter((f) => f.endsWith("route.ts"))
  .filter((f) => {
    const rel = relative(API_DIR, f).split("\\").join("/");
    if (ALLOWED_PUBLIC.has(rel)) return false;
    const src = readFileSync(f, "utf8");
    return !GUARDS.some((g) => src.includes(g));
  })
  .map((f) => relative(API_DIR, f).split("\\").join("/"));

assert.deepStrictEqual(
  unguarded,
  [],
  `Unguarded API routes found:\n  ${unguarded.join("\n  ")}\n` +
    `Add requireInternal(req) / hasInternalSecret(req), or allow-list it in this script.`
);

console.log(`✓ all API routes guarded (${walk(API_DIR).filter((f) => f.endsWith("route.ts")).length} checked)`);
