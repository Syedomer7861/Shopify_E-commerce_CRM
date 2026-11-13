#!/usr/bin/env node
/**
 * Smallest thing that fails if owner-edited site content could break a page
 * or inject a dangerous link. Bad stored values must fall back to built-in text.
 * Run: node scripts/check-site-content.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "site-content");
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [join("node_modules", "typescript", "bin", "tsc"), "src/lib/site-content.ts",
  "--outDir", out, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck", "--esModuleInterop"], { stdio: "inherit" });
const { resolveContent, CONTENT_KEYS } = createRequire(import.meta.url)(join(process.cwd(), out, "site-content.js"));

const def = CONTENT_KEYS["home.hero"].defaults;
assert.deepStrictEqual(resolveContent("home.hero", null), def, "nothing stored = built-in text");
assert.strictEqual(resolveContent("home.hero", { headline: "New headline" }).headline, "New headline", "partial value merges over defaults");
assert.deepStrictEqual(resolveContent("home.hero", { primary_href: "javascript:alert(1)" }), def, "javascript: link rejected");
assert.deepStrictEqual(resolveContent("home.hero", { primary_href: "//evil.example" }), def, "protocol-relative link rejected");
assert.deepStrictEqual(resolveContent("home.hero", { primary_href: "/\\evil.example" }), def, "backslash off-site link rejected");
assert.strictEqual(resolveContent("home.hero", { primary_href: "/" }).primary_href, "/", "home path allowed");
assert.deepStrictEqual(resolveContent("home.hero", { headline: "x".repeat(500) }), def, "over-long text rejected");
assert.deepStrictEqual(resolveContent("home.hero", { headline: "" }), def, "required text can't be emptied");
assert.deepStrictEqual(resolveContent("home.hero", { extra: "x" }), def, "unknown field rejected");
assert.strictEqual(resolveContent("site.announcement", { enabled: true, text: "Hi", href: "https://example.com/x" }).href, "https://example.com/x");
assert.strictEqual(resolveContent("site.announcement", { enabled: "yes" }).enabled, false, "wrong type falls back");
console.log("check-site-content: OK");
