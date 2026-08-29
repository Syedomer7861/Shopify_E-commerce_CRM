#!/usr/bin/env node
/**
 * Smallest thing that fails if resolveUnmaskedPhone regresses back to
 * either technique removed in "unmask fallbacks could reattach a real
 * order to an unrelated customer": matching an existing customer by a
 * shared address-string prefix, or scanning a raw webhook payload's full
 * JSON text for any 10-digit number. Both could silently attach one real
 * customer's order to a completely different person's record - there's
 * no safe way to do either, so this checks they're gone, not that they
 * behave correctly (they shouldn't exist at all).
 *
 * A source-text guard, not a behavioral test - resolveUnmaskedPhone is a
 * 5-step, fully DB-coupled function (customers/abandoned_carts/
 * webhook_logs lookups); simulating all five steps behaviorally would
 * mean re-implementing Supabase's query builder as a mock. What actually
 * matters here is narrower and doesn't need that: these two specific
 * patterns must never come back.
 *
 * Run: node scripts/check-unmask-safety.mjs
 */
import { readFileSync } from "node:fs";
import assert from "node:assert";

const src = readFileSync("src/lib/unmask-utils.ts", "utf8");

assert.ok(
  !/\.ilike\(\s*["']address["']/.test(src),
  "address-prefix customer matching must not return - two unrelated people can easily share a 20-char address prefix (a landmark, a building), and this silently misattributed a real order in production"
);

assert.ok(
  !/find10DigitPhone/.test(src),
  "the raw-payload full-text digit scan (find10DigitPhone) must not return - it could pick up an unrelated id fragment or someone else's number mentioned anywhere in the payload as \"the\" phone"
);

assert.ok(
  /JSON\.stringify\(log\.payload\)/.test(src) === false,
  "webhook-log mining must not stringify-and-regex-scan a full payload for a phone-shaped number"
);

// The safer replacement (known phone-shaped fields only) must still be
// wired into the webhook-log-mining step, not just exist unused elsewhere.
assert.ok(
  /extractStandardPhone\(data\)/.test(src),
  "webhook-log mining must extract from known phone fields (extractStandardPhone), not free-text scanning"
);

console.log("check-unmask-safety: OK");
