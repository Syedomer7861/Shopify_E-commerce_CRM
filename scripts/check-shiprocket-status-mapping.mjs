#!/usr/bin/env node
/**
 * Regression guard for the "Undelivered-EN-ROUTE" bug: a plain
 * s.includes("delivered") check also matches "undelivered" since
 * "delivered" is a substring of it - a failed delivery attempt would
 * silently read as a success. Confirmed live in production data. Also
 * covers the real courier status strings (PICKED UP, REACHED AT
 * DESTINATION HUB, Reached Back At Seller, RTO IN INTRANSIT) found
 * mismapped to "pending" during a live audit.
 * Run: node scripts/check-shiprocket-status-mapping.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "shiprocket-status");
mkdirSync(out, { recursive: true });

execFileSync(
  process.execPath,
  [
    join("node_modules", "typescript", "bin", "tsc"),
    "src/lib/shiprocket-status.ts",
    "--outDir", out,
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--skipLibCheck",
  ],
  { stdio: "inherit" }
);

const require_ = createRequire(import.meta.url);
const { mapShiprocketStatus } = require_(join(process.cwd(), out, "shiprocket-status.js"));

// The core bug: "undelivered" must never fall into the "delivered" branch.
assert.strictEqual(mapShiprocketStatus("Undelivered-EN-ROUTE"), "in_transit", "undelivered != delivered");
assert.strictEqual(mapShiprocketStatus("UNDELIVERED"), "in_transit", "undelivered (caps) != delivered");

// Real courier strings confirmed live, previously falling through to the
// "pending" default despite the shipment already being in the courier's
// hands.
assert.strictEqual(mapShiprocketStatus("PICKED UP"), "in_transit");
assert.strictEqual(mapShiprocketStatus("REACHED AT DESTINATION HUB"), "in_transit");
assert.strictEqual(mapShiprocketStatus("Reached Back At Seller"), "rto");
assert.strictEqual(mapShiprocketStatus("RTO IN INTRANSIT"), "rto");
assert.strictEqual(mapShiprocketStatus("RTO Delivered"), "rto", "rto delivered must not match plain delivered");

// Genuinely still pre-shipment.
assert.strictEqual(mapShiprocketStatus("Out for Pickup"), "pending");
assert.strictEqual(mapShiprocketStatus(""), "pending");

// Unchanged base cases.
assert.strictEqual(mapShiprocketStatus("Delivered"), "delivered");
assert.strictEqual(mapShiprocketStatus("Canceled"), "failed");
assert.strictEqual(mapShiprocketStatus("Out for Delivery"), "out_for_delivery");
assert.strictEqual(mapShiprocketStatus(7), "delivered", "numeric code 7");
assert.strictEqual(mapShiprocketStatus(9), "rto", "numeric code 9");

console.log("check-shiprocket-status-mapping: OK");
