#!/usr/bin/env node
/**
 * Fails if any API route HANDLER is reachable without an auth check.
 * Run: node scripts/check-route-guards.mjs
 *
 * Checks each exported GET/POST/... body on its own. The earlier version
 * only asked "does a guard appear anywhere in the file", which passed three
 * reminder routes whose POST was guarded and whose GET was wide open.
 *
 * ponytail: static scan, not a runtime test. It catches the regression that
 * actually happens (a handler ships with no guard); it does not prove the
 * guards themselves are correct.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import assert from "node:assert";

const API_DIR = "src/app/api";

// Routes that are intentionally reachable without a session or shared secret.
const ALLOWED_PUBLIC = new Set([
  "auth/google/route.ts",        // starts the OAuth redirect
  "auth/google/callback/route.ts", // OAuth callback, validated by state/code
  "contact/route.ts",            // public lead form; no session to require - rate-limited instead
  "billing/signup/route.ts",     // public self-serve signup; off without Razorpay keys, rate-limited, org created on hold
  "forms/[id]/route.ts",         // public web-to-lead form: rate-limited, honeypot; submit_web_form() refuses paused/held forms
]);

// Any one of these inside a handler body counts as a guard.
const GUARD = new RegExp([
  "requireInternal",
  "requirePrivileged",
  "hasInternalSecret",
  "getAuthenticatedSession",
  "requireMarketing",
  "requireWorkspaceAdmin",
  "ensureAdmin",
  "requirePlatformOwner",
  "requireOwnerOrInternal",   // internal secret or verified platform owner
  "privilegedScope",          // requirePrivileged + caller's own workspace
  "memberScope",              // internal secret or signed-in active member, scoped to own workspace
  "SHOPIFY_WEBHOOK_SECRET",   // webhook: HMAC verified instead of a session
  "SHIPROCKET_WEBHOOK_TOKEN",
  "billingSession",           // signed-in user + org, read server-side
  "verifyWebhookSignature",   // Razorpay webhook: HMAC verified
  "apiAuth",                  // public API: hashed workspace API key + scope check
].join("|"));

// A handler that just hands off to a sibling verb inherits that verb's guard.
const DELEGATES = /return\s+(await\s+)?(GET|POST|PUT|PATCH|DELETE)\(/;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function unguardedHandlers(source) {
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\s*\([^)]*\)[^{]*\{/g;
  const bad = [];
  let m;
  while ((m = re.exec(source))) {
    let i = re.lastIndex, depth = 1;
    while (depth && i < source.length) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    const body = source.slice(re.lastIndex, i);
    if (!GUARD.test(body) && !DELEGATES.test(body)) bad.push(m[1]);
  }
  return bad;
}

const files = walk(API_DIR).filter((f) => f.endsWith("route.ts"));
const unguarded = files.flatMap((f) => {
  const rel = relative(API_DIR, f).split(sep).join("/");
  if (ALLOWED_PUBLIC.has(rel)) return [];
  return unguardedHandlers(readFileSync(f, "utf8")).map((verb) => `${verb} ${rel}`);
});

assert.deepStrictEqual(
  unguarded,
  [],
  `Unguarded API handlers found:\n  ${unguarded.join("\n  ")}\n` +
    `Add a guard inside that handler, or allow-list the route in this script.`
);

console.log(`✓ all API handlers guarded (${files.length} route files checked)`);
