#!/usr/bin/env node
/**
 * Fails if any route reads WHATSAPP_BRIDGE_URL directly instead of going
 * through bridgeUrlFor(). A direct `settings.whatsapp_bridge_url ||
 * process.env.WHATSAPP_BRIDGE_URL` let every org send through the one
 * shared bridge, so one tenant's customers got messages from another
 * tenant's number and their replies were filed under that other tenant.
 *
 * Allowed readers: server-settings.ts (bridgeUrlFor itself), the status
 * route (gated on the bridge owner) and the platform-owner health page.
 *
 * Run: node scripts/check-wa-bridge-scope.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert";

const ALLOWED = new Set([
  "src/lib/server-settings.ts",
  "src/app/api/admin/system-health/route.ts",
]);

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p.replace(/\\/g, "/")] : [];
});

const offenders = walk("src").filter((f) => !ALLOWED.has(f) && readFileSync(f, "utf8").includes("process.env.WHATSAPP_BRIDGE_URL"));
assert.deepStrictEqual(offenders, [], `read WHATSAPP_BRIDGE_URL directly; use bridgeUrlFor(): ${offenders.join(", ")}`);

const settings = readFileSync("src/lib/server-settings.ts", "utf8");
assert.match(settings, /if \(env && settings\.org_id === \(await getBridgeOwnerOrgId\(\)\)\) return env;/, "bridgeUrlFor must only hand the env bridge to its owner org");

// Hosted bridge: the org path carries an HMAC the bridge checks the same way.
const HMAC = /createHmac\("sha256", \w+\)\.update\(orgId\)\.digest\("hex"\)/;
assert.match(settings, HMAC, "hostedBridgeUrl must sign the org id");
const bridge = readFileSync("bridge/server.mjs", "utf8");
assert.match(bridge, HMAC, "bridge must verify the same org token");
assert.match(bridge, /timingSafeEqual/, "bridge token check must be constant-time");
assert.match(bridge, /!UUID\.test\(orgId\) \|\| !tokenOk/, "bridge must reject non-uuid org ids before touching session paths");
// The settings proxy must never echo the bridge URL (a credential) to the browser.
assert.ok(!/NextResponse\.json\([^)]*\burl\b/.test(readFileSync("src/lib/wa-bridge-proxy.ts", "utf8")), "wa-bridge-proxy must not return the bridge URL");

const hook = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
assert.ok(!hook.includes("getDefaultOrgId"), "inbound webhook must resolve the bridge owner, not the seed org directly");

console.log("check-wa-bridge-scope: OK");
