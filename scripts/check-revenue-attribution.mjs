#!/usr/bin/env node
/**
 * Smallest thing that fails if revenue attribution regresses. This is the
 * fix for the double-counting bug (see commit "agent revenue was double-
 * counted...") - a regression here silently re-breaks agent revenue
 * numbers with no visible error anywhere. Run: node scripts/check-revenue-attribution.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "revenue-attribution");
mkdirSync(out, { recursive: true });

execFileSync(
  process.execPath,
  [
    join("node_modules", "typescript", "bin", "tsc"),
    "src/lib/revenue-attribution.ts",
    "--outDir", out,
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--skipLibCheck",
  ],
  { stdio: "inherit" }
);

const require_ = createRequire(import.meta.url);
const { attributeOrderRevenue } = require_(join(process.cwd(), out, "revenue-attribution.js"));

// A minimal recorder standing in for the real Supabase client - records
// every from()/select()/eq()/upsert() call so each test can assert what
// (if anything) touched the database, without a real connection.
function fakeSupabase(orderRow) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        select() {
          return {
            eq(col, val) {
              return {
                async maybeSingle() {
                  calls.push({ type: "select", table, col, val });
                  return { data: orderRow };
                },
              };
            },
          };
        },
        async upsert(payload, opts) {
          calls.push({ type: "upsert", table, payload, opts });
          return { error: null };
        },
      };
    },
  };
}

// Ineligible task type -> never touches the database at all
{
  const db = fakeSupabase({ total_price: 999 });
  await attributeOrderRevenue(db, { orderId: "o1", agentId: "a1", taskId: "t1", taskType: "review" });
  assert.strictEqual(db.calls.length, 0, "ineligible task type must not query or write anything");
}

// Missing orderId -> never touches the database
{
  const db = fakeSupabase({ total_price: 999 });
  await attributeOrderRevenue(db, { orderId: null, agentId: "a1", taskId: "t1", taskType: "recovery" });
  assert.strictEqual(db.calls.length, 0, "missing orderId must not query or write anything");
}

// Missing agentId -> never touches the database
{
  const db = fakeSupabase({ total_price: 999 });
  await attributeOrderRevenue(db, { orderId: "o1", agentId: undefined, taskId: "t1", taskType: "reorder" });
  assert.strictEqual(db.calls.length, 0, "missing agentId must not query or write anything");
}

// Order doesn't exist -> selects, but never writes
{
  const db = fakeSupabase(null);
  await attributeOrderRevenue(db, { orderId: "ghost", agentId: "a1", taskId: "t1", taskType: "win_back" });
  assert.strictEqual(db.calls.length, 1, "should look the order up once");
  assert.strictEqual(db.calls[0].type, "select");
  assert.strictEqual(db.calls.some(c => c.type === "upsert"), false, "no order found -> never writes an attribution");
}

// Eligible type + real order -> writes exactly one upsert, with the
// order's actual value, targeting order_id as the conflict key with
// ignoreDuplicates - this is the whole fix: a second call for an order
// already claimed must be a no-op via the database, not application logic.
{
  const db = fakeSupabase({ total_price: 1249.5 });
  await attributeOrderRevenue(db, { orderId: "o42", agentId: "agent-9", taskId: "task-7", taskType: "recovery" });
  const upserts = db.calls.filter(c => c.type === "upsert");
  assert.strictEqual(upserts.length, 1, "eligible completion on a real order writes exactly one attribution");
  const [{ table, payload, opts }] = upserts;
  assert.strictEqual(table, "order_revenue_attribution");
  assert.strictEqual(payload.order_id, "o42");
  assert.strictEqual(payload.agent_id, "agent-9");
  assert.strictEqual(payload.task_id, "task-7");
  assert.strictEqual(payload.task_type, "recovery");
  assert.strictEqual(payload.amount, 1249.5, "amount must come from the order's real total_price");
  assert.strictEqual(opts.onConflict, "order_id", "order_id must be the conflict target - this is what makes double-counting impossible");
  assert.strictEqual(opts.ignoreDuplicates, true, "a second claim on the same order must be silently ignored, not overwritten or errored");
}

// All three eligible types are accepted (only these three - not review,
// cod_verify, transit_update, and the rest, which service an order that
// was already happening rather than driving it)
for (const taskType of ["recovery", "reorder", "win_back"]) {
  const db = fakeSupabase({ total_price: 500 });
  await attributeOrderRevenue(db, { orderId: "o1", agentId: "a1", taskId: "t1", taskType });
  assert.strictEqual(db.calls.some(c => c.type === "upsert"), true, `${taskType} must be revenue-eligible`);
}
for (const taskType of ["review", "cod_verify", "transit_update", "welcome_call", "ndr", "issue_resolution", "vip_followup", "manager_audit", "flagged", "final_followup"]) {
  const db = fakeSupabase({ total_price: 500 });
  await attributeOrderRevenue(db, { orderId: "o1", agentId: "a1", taskId: "t1", taskType });
  assert.strictEqual(db.calls.length, 0, `${taskType} must NOT be revenue-eligible`);
}

console.log("check-revenue-attribution: OK");
