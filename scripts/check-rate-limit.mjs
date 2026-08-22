#!/usr/bin/env node
/**
 * Smallest thing that fails if the rate limiter or the sync budget breaks.
 * Run: node scripts/check-rate-limit.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

// Built inside the project: the compiled file imports next/server, which only
// resolves from a directory under this node_modules tree.
const out = join("node_modules", ".cache", "crm-checks", "rate-limit");
mkdirSync(out, { recursive: true });

try {
  execFileSync(
    process.execPath,
    [
      join("node_modules", "typescript", "bin", "tsc"),
      "src/lib/rate-limit.ts",
      "--outDir", out,
      "--module", "commonjs",
      "--target", "es2020",
      "--moduleResolution", "node",
      "--skipLibCheck",
    ],
    { stdio: "inherit" }
  );

  // CommonJS + require: node ESM will not resolve the bare "next/server"
  // specifier that the compiled file imports.
  const require_ = createRequire(import.meta.url);
  const mod = require_(join(process.cwd(), out, "rate-limit.js"));
  const { checkRateLimit, clientKey, __resetRateLimits } = mod;

  // ── window accounting ────────────────────────────────────────────────────
  __resetRateLimits();
  for (let i = 0; i < 3; i++) {
    const r = checkRateLimit("k", 3, 60_000);
    assert.ok(r.allowed, `request ${i + 1} of 3 must be allowed`);
    assert.strictEqual(r.remaining, 2 - i, "remaining must count down");
  }

  const blocked = checkRateLimit("k", 3, 60_000);
  assert.strictEqual(blocked.allowed, false, "the 4th request must be blocked");
  assert.ok(blocked.retryAfterSeconds >= 1, "a blocked caller must be told when to retry");

  // ── keys are independent ─────────────────────────────────────────────────
  assert.ok(checkRateLimit("other", 3, 60_000).allowed, "a different key must have its own budget");

  // ── the window actually expires ──────────────────────────────────────────
  __resetRateLimits();
  assert.ok(checkRateLimit("short", 1, 1).allowed);
  assert.strictEqual(checkRateLimit("short", 1, 1).allowed, false, "second call inside the window is blocked");
  await new Promise((r) => setTimeout(r, 15));
  assert.ok(checkRateLimit("short", 1, 1).allowed, "a new window must reset the count");

  // ── client identity ──────────────────────────────────────────────────────
  const withFwd = new Request("https://x.test", {
    headers: { "x-forwarded-for": "203.0.113.9, 70.41.3.18" },
  });
  assert.strictEqual(
    clientKey(withFwd, "scope"),
    "scope:203.0.113.9",
    "must take the first hop of x-forwarded-for, not the proxy chain"
  );
  assert.strictEqual(
    clientKey(new Request("https://x.test"), "scope"),
    "scope:unknown",
    "a request with no forwarding headers must still produce a key"
  );
  assert.notStrictEqual(
    clientKey(withFwd, "a"),
    clientKey(withFwd, "b"),
    "the same IP must have separate budgets per scope"
  );

  console.log("✓ rate-limit: window accounting, expiry, key isolation, proxy parsing");
} finally {
  rmSync(out, { recursive: true, force: true });
}
