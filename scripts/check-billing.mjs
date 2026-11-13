#!/usr/bin/env node
/**
 * Smallest thing that fails if billing rules drift: which Razorpay events
 * open, keep or close access, and that both signatures reject tampering.
 * Run: node scripts/check-billing.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "billing");
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [join("node_modules", "typescript", "bin", "tsc"), "src/lib/billing.ts",
  "--outDir", out, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck", "--types", "node"], { stdio: "inherit" });
const B = createRequire(import.meta.url)(join(process.cwd(), out, "billing.js"));

assert.deepStrictEqual(
  ["subscription.authenticated", "subscription.activated", "subscription.charged", "subscription.pending",
    "subscription.halted", "subscription.cancelled", "subscription.completed", "payment.captured"].map(B.eventAction),
  ["start", "start", "charged", "past_due", "halt", "cancel", "cancel", null],
  "pending keeps access (past_due); only halted/cancelled/completed lock out");

const secret = "test_secret";
const good = createHmac("sha256", secret).update("pay_1|sub_1").digest("hex");
assert.ok(B.verifyCheckoutSignature("pay_1", "sub_1", good, secret));
assert.ok(!B.verifyCheckoutSignature("pay_2", "sub_1", good, secret), "other payment id rejected");
assert.ok(!B.verifyCheckoutSignature("pay_1", "sub_1", good, ""), "no secret, no pass");
assert.ok(!B.verifyCheckoutSignature("pay_1", "sub_1", "short", secret), "length mismatch does not throw");

const body = '{"event":"subscription.charged"}';
const wsig = createHmac("sha256", "wh").update(body).digest("hex");
assert.ok(B.verifyWebhookSignature(body, wsig, "wh"));
assert.ok(!B.verifyWebhookSignature(body + " ", wsig, "wh"), "changed body rejected");
assert.ok(!B.verifyWebhookSignature(body, "", "wh"));

assert.strictEqual(B.totalCount("monthly"), 120);
assert.strictEqual(B.unixToIso(0), null);
assert.strictEqual(B.unixToIso(1_700_000_000), "2023-11-14T22:13:20.000Z");
console.log("check-billing: OK");
