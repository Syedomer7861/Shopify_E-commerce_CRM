#!/usr/bin/env node
/**
 * KPI role tests against the linked Supabase project. Runs scripts/kpi-roles.sql
 * (or the SQL file given as the first argument) in one transaction that ROLLS BACK (nothing is kept), as admin, agent, another
 * org's admin and the platform owner, and fails if any expectation breaks.
 *
 * Needs the Supabase CLI logged in and, in .env.local:
 *   KPI_TEST_ADMIN, KPI_TEST_AGENT (same org), KPI_TEST_OTHER_ADMIN (other org)
 * Skips (exit 0) when they are absent. Run: npm run test:kpi-roles
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^(KPI_TEST_[A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
}
const ids = { __ADMIN__: process.env.KPI_TEST_ADMIN, __AGENT__: process.env.KPI_TEST_AGENT, __OTHER_ADMIN__: process.env.KPI_TEST_OTHER_ADMIN };
if (Object.values(ids).some((v) => !v)) {
  console.log("- kpi role tests skipped (KPI_TEST_ADMIN / KPI_TEST_AGENT / KPI_TEST_OTHER_ADMIN not set)");
  process.exit(0);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for (const [k, v] of Object.entries(ids)) if (!UUID.test(v)) { console.error(`✗ ${k} is not a uuid`); process.exit(1); }

const SQL_FILE = process.argv[2] ?? "scripts/kpi-roles.sql";
let sql = readFileSync(SQL_FILE, "utf8");
for (const [k, v] of Object.entries(ids)) sql = sql.replaceAll(k, v);
if (!/\nROLLBACK;\s*$/.test(sql)) { console.error(`✗ ${SQL_FILE} must end with ROLLBACK`); process.exit(1); }
const file = join(mkdtempSync(join(tmpdir(), "kpi-roles-")), "run.sql");
writeFileSync(file, sql);

let out;
try {
  out = execFileSync("npx", ["supabase@3.1.0", "db", "query", "--remote", "--yes", "-f", file], {
    encoding: "utf8", shell: process.platform === "win32", timeout: 180_000,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=512" },
  });
} catch (e) {
  console.error(`✗ kpi role tests could not run: ${String(e.stdout || e.message).slice(-800)}`);
  process.exit(1);
}
const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
const results = json.rows?.[0]?.results ?? [];
if (results.length === 0) { console.error(`✗ kpi role tests returned nothing: ${out.slice(-800)}`); process.exit(1); }
const failed = results.filter((r) => !r.ok);
for (const r of failed) console.error(`✗ ${r.k}${r.d ? `: ${r.d}` : ""}`);
if (failed.length) process.exit(1);
console.log(`✓ ${SQL_FILE}: ${results.length} passed (rolled back)`);
