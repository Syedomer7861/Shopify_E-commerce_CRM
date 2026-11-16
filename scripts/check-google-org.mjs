#!/usr/bin/env node
/**
 * Per-org Google Drive & Sheets guards:
 *  - org_google_connections is service-role only (RLS on, no policies, no grants)
 *  - the status route never returns the refresh token
 *  - OAuth state is checked in the callback (login CSRF)
 *  - sheet rows are written raw and formula-looking text is neutralised
 *  - org backups only ever read the org's own rows
 *
 * Run: node scripts/check-google-org.mjs
 */
import { readFileSync } from "node:fs";
import assert from "node:assert";

const read = (f) => readFileSync(f, "utf8");
const mig = read("supabase/migrations/20261116b_org_google_connections.sql");
assert.match(mig, /enable row level security/i, "token table must have RLS on");
assert.match(mig, /revoke all on public\.org_google_connections from anon, authenticated/i, "token table must not be granted to clients");
assert.ok(!/create policy/i.test(mig), "token table must have no client policies");

const status = read("src/app/api/google/connection/route.ts");
assert.ok(!/refresh_token\s*[:,]/.test(status.split("export async function GET")[1].split("export async function")[0]), "status must not return the token");

const cb = read("src/app/api/google/callback/route.ts");
assert.match(cb, /g_oauth_state/, "callback must check OAuth state");
assert.match(cb, /timingSafeEqual/, "state compare must be constant-time");

const lib = read("src/lib/google-org.ts");
assert.match(lib, /\.eq\("org_id", conn\.org_id\)\.range/, "org backup must filter rows by org_id");
assert.match(lib, /\/\^\[=\+\\-@/, "cells must neutralise formula prefixes");
assert.match(read("src/lib/google-sheets.ts"), /addRow\(cleanRow, \{ raw: true \}\)/, "sheet rows must be written raw");

console.log("check-google-org: OK");
