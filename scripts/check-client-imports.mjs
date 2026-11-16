#!/usr/bin/env node
/**
 * Fails if a browser bundle ("use client" file, edge route or middleware)
 * reaches a server-only module through its imports. The Settings page
 * reaching server-settings.ts (node:crypto) broke a production build that
 * tsc and lint both passed.
 *
 * Run: node scripts/check-client-imports.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve("src");
const SERVER_ONLY = ["lib/server-settings.ts", "lib/whatsapp.ts", "lib/wa-bridge-proxy.ts", "lib/google-org.ts", "lib/google-sheets.ts", "lib/google-drive.ts"].map((f) => join(ROOT, f));

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?)$/.test(f)) files.push(p);
  }
})(ROOT);

const resolveSpec = (from, spec) => {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + ext) && statSync(base + ext).isFile()) return base + ext;
  }
  return null;
};

const src = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
const deps = new Map(files.map((f) => {
  // Type-only imports are erased and never bundled.
  const code = src.get(f).replace(/import\s+type\s[^;]+;/g, "");
  const out = [];
  for (const m of code.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const r = resolveSpec(f, m[1] || m[2]);
    if (r) out.push(r);
  }
  return [f, out];
}));

const trailTo = (start) => {
  const seen = new Set();
  const stack = [[start, [start]]];
  while (stack.length) {
    const [f, trail] = stack.pop();
    if (SERVER_ONLY.includes(f)) return trail;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of deps.get(f) || []) stack.push([d, [...trail, d]]);
  }
  return null;
};

const bad = [];
for (const f of files) {
  const s = src.get(f);
  if (!/^\s*["']use client["']/.test(s) && !/runtime\s*=\s*["']edge/.test(s) && !f.endsWith("middleware.ts")) continue;
  const t = trailTo(f);
  if (t) bad.push(t.map((x) => relative(ROOT, x)).join(" -> "));
}
if (bad.length) {
  console.error("check-client-imports: browser/edge code reaches server-only modules:\n  " + bad.join("\n  "));
  process.exit(1);
}
console.log("check-client-imports: OK");
