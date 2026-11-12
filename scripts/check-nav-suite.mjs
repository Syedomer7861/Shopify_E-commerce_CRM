#!/usr/bin/env node
/**
 * Smallest thing that fails if the organisation-level "Sales & call centre"
 * switch stops closing its pages, or starts closing them for an organisation
 * that left it on.
 * Run: node scripts/check-nav-suite.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const js = ts.transpileModule(readFileSync("src/lib/permissions.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", "require", js)(mod, mod.exports, require_);
const { allowedNavModules, COMMERCE_NAV, ALL_NAV_MODULES, NEUTRAL_NAV_MODULES } = mod.exports;

const off = { org_disabled_modules: ["commerce"] };

// Switch left on: nothing changes for anyone.
assert.strictEqual(allowedNavModules({ role: "admin", org_disabled_modules: [] }), null, "admin, suite on = unrestricted");
assert.strictEqual(allowedNavModules({ role: "agent" }), null, "controls not loaded = unrestricted, as before");
assert.deepStrictEqual(allowedNavModules({ role: "x", role_nav_modules: ["tasks", "chat"] }), ["tasks", "chat"], "role list untouched when suite is on");

// Switch off: closed for admins too, and for a personal list that names the pages.
const admin = allowedNavModules({ role: "admin", ...off });
assert.ok(Array.isArray(admin), "admin gets a real list once the suite is off");
for (const key of COMMERCE_NAV) assert.ok(!admin.includes(key), `admin must not keep ${key}`);
for (const key of ["dashboard", "my-hub", "chat", "calendar", "team", "roles", "organisation", "settings", "workflows"]) {
  assert.ok(admin.includes(key), `admin must keep ${key}`);
}
assert.deepStrictEqual(
  allowedNavModules({ role: "web_developer", permissions: { nav_modules: ["dashboard", "tasks", "orders", "chat"] }, ...off }),
  ["dashboard", "chat"], "personal list loses the suite pages");

// Every suite key is a real page key, and the neutral menu holds none of them.
for (const key of COMMERCE_NAV) assert.ok(ALL_NAV_MODULES.includes(key), `${key} is not a known page`);
for (const key of NEUTRAL_NAV_MODULES) assert.ok(!COMMERCE_NAV.includes(key) && ALL_NAV_MODULES.includes(key), `${key} must be neutral`);

console.log("check-nav-suite: OK");
