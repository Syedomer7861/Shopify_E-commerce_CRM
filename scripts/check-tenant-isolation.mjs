#!/usr/bin/env node
/**
 * Live tenant-isolation probe. Fails if a logged-out caller, or a non-admin
 * user of a second organisation, can see rows that aren't theirs.
 * Run: node scripts/check-tenant-isolation.mjs
 *
 * Counts rows only (HEAD requests) - never reads data, never writes.
 *
 * Why a second org's NON-admin: testing as an existing admin can't reveal a
 * leftover permissive policy, because the admin is allowed to see those rows
 * anyway. A real cross-tenant leak survived six verified batches that way.
 *
 * Needs in .env.local (skips, exit 0, when absent so offline runs still pass):
 *   ISOLATION_TEST_EMAIL / ISOLATION_TEST_PASSWORD  a non-admin login in a
 *     small second org; ISOLATION_TEST_ORG_ID  that org's id.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

const {
  NEXT_PUBLIC_SUPABASE_URL: URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  ISOLATION_TEST_EMAIL: EMAIL,
  ISOLATION_TEST_PASSWORD: PASSWORD,
  ISOLATION_TEST_ORG_ID: ORG_ID,
} = process.env;

if (!URL || !ANON || !SERVICE || !EMAIL || !PASSWORD || !ORG_ID) {
  console.log("- tenant-isolation check skipped (ISOLATION_TEST_* / Supabase env not set)");
  process.exit(0);
}

// Rows a member may legitimately see with no org_id column to compare against.
const EXPECTED_MAX = { organizations: 1, settings_public: 1 };
// Shared, read-only catalogues with no workspace data (members read every row).
const SHARED_CATALOGUE = new Set(["industry_templates"]);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(URL, SERVICE, opts);
const anon = createClient(URL, ANON, opts);
const member = createClient(URL, ANON, opts);

const { error: loginErr } = await member.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (loginErr) {
  console.error(`✗ tenant-isolation: could not sign in as ${EMAIL}: ${loginErr.message}`);
  process.exit(1);
}

const spec = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).then((r) => r.json());
const defs = spec.definitions || {};

async function count(client, table, orgId) {
  let q = client.from(table).select("*", { count: "exact", head: true });
  if (orgId) q = q.eq("org_id", orgId);
  const { count: n, error } = await q;
  return error ? 0 : n ?? 0; // an RLS/permission error means "sees nothing"
}

const leaks = [];
for (const table of Object.keys(defs).sort()) {
  const hasOrg = Boolean(defs[table]?.properties?.org_id);
  const [asAnon, asMember, own] = await Promise.all([
    count(anon, table),
    count(member, table),
    hasOrg ? count(service, table, ORG_ID) : Promise.resolve(EXPECTED_MAX[table] ?? 0),
  ]);
  if (asAnon > 0) leaks.push(`${table}: logged-out caller sees ${asAnon} rows`);
  if (asMember > own && !SHARED_CATALOGUE.has(table)) leaks.push(`${table}: other-org member sees ${asMember} rows, own org has ${own}`);
}

if (leaks.length) {
  console.error(`✗ tenant isolation broken on ${leaks.length} relation(s):\n  ${leaks.join("\n  ")}`);
  process.exit(1);
}
console.log(`✓ tenant isolation holds (${Object.keys(defs).length} tables/views probed)`);
