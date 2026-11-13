#!/usr/bin/env node
/**
 * Smallest thing that fails if attribution starts storing personal data or
 * junk: referrer kept as host only, internal navigation ignored, first touch
 * kept, bad input rejected, consent cookie parsed strictly.
 * Run: node scripts/check-attribution.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "attribution");
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [join("node_modules", "typescript", "bin", "tsc"), "src/lib/attribution.ts",
  "--outDir", out, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck", "--esModuleInterop"], { stdio: "inherit" });
const A = createRequire(import.meta.url)(join(process.cwd(), out, "attribution.js"));

const now = new Date("2026-11-13T10:00:00Z");
const site = "https://cureforever-crm.vercel.app";
const t = A.touchFromUrl(`${site}/features?utm_source=google&utm_medium=cpc&utm_campaign=diwali&email=a@b.c`, "", now);
assert.deepStrictEqual(t, { source: "google", medium: "cpc", campaign: "diwali", landing: "/features", at: now.toISOString() }, "UTM captured, other params ignored");
const r = A.touchFromUrl(`${site}/`, "https://www.linkedin.com/feed/update/123?token=secret", now);
assert.strictEqual(r.referrer, "www.linkedin.com", "referrer reduced to host");
assert.ok(!JSON.stringify(r).includes("secret"), "no referrer path or query stored");
assert.strictEqual(A.touchFromUrl(`${site}/blog`, `${site}/`, now), null, "internal navigation is not a touch");
assert.strictEqual(A.touchFromUrl(`${site}/blog`, "", now), null, "direct visit without tags is not a touch");
assert.strictEqual(A.touchFromUrl(`${site}/`, "android-app://com.x", now), null, "non-web referrer ignored");
assert.strictEqual(A.touchFromUrl("not a url", "", now), null);
assert.strictEqual(A.touchFromUrl(`${site}/?utm_source=${"x".repeat(500)}`, "", now).source.length, 100, "long tags truncated");

const m1 = A.mergeTouch(null, t);
const m2 = A.mergeTouch(m1, r);
assert.deepStrictEqual(m2.first, t, "first touch kept");
assert.deepStrictEqual(m2.last, r, "latest touch replaced");
assert.deepStrictEqual(A.mergeTouch({ first: { evil: 1 } }, r).first, r, "corrupt stored value replaced");

assert.ok(!A.AttributionSchema.safeParse({ first: { ...t, referrer: "a/b" }, last: t }).success, "referrer must be a host");
assert.ok(!A.AttributionSchema.safeParse({ first: { ...t, landing: "https://evil" }, last: t }).success, "landing must be a path");
assert.ok(!A.AttributionSchema.safeParse({ first: { ...t, email: "x" }, last: t }).success, "unknown fields rejected");

assert.strictEqual(A.readConsent("a=1; cc_consent=analytics; b=2"), "analytics");
assert.strictEqual(A.readConsent("cc_consent=essential"), "essential");
assert.strictEqual(A.readConsent("cc_consent=yes"), null, "only known values count");
assert.strictEqual(A.readConsent("xcc_consent=analytics"), null, "similar cookie name ignored");
assert.ok(A.isPublicPath("/") && A.isPublicPath("/blog/x") && A.isPublicPath("/contact"));
assert.ok(!A.isPublicPath("/dashboard") && !A.isPublicPath("/superadmin"));
console.log("check-attribution: OK");
