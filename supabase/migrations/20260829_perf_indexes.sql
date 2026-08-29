-- Performance fix: several hot query paths had zero supporting index,
-- forcing a sequential scan + sort over the whole table on every hit.
-- Confirmed against real code, not speculative:
--
-- orders (20,530 rows):
--   - ordered_at: /orders sorts by this DESC on every single page load
--     (src/app/(app)/orders/page.tsx), unindexed.
--   - order_number: the lookup key in nearly every webhook/sync route's
--     duplicate-prevention check added/fixed today (webhooks/shiprocket,
--     webhooks/shopify, sync-logic.ts, sync/shiprocket, sync/all,
--     order-reconciliation/backfill, merge-duplicate-orders,
--     merge-suspect-orders) - every one of those ran a sequential scan.
--
-- tasks (16,298 rows):
--   - (assigned_to, completed_at) where status is a resolved state: the
--     exact shape of the new Performance page query (today's commit
--     c0bf598) - was hitting neither of the two existing composite
--     indexes (both lead with customer_id/order_id, not assigned_to).
--
-- agent_activity_logs / call_logs: analytics/agents/route.ts (Performance
-- page's data source) filters both by a date range and, for activity
-- logs, groups by agent_id - neither had a usable index.
--
-- webhook_logs (11,204 rows, growing unboundedly): only had a primary
-- key index. sync/all's backlog processor filters source+status and
-- orders by created_at every run.
--
-- All additive, non-breaking - CREATE INDEX only speeds up existing
-- queries, changes no behavior. Table sizes here (5k-20k rows) make a
-- non-concurrent build sub-second, safe for this app's traffic.

create index if not exists idx_orders_ordered_at on orders (ordered_at desc);
create index if not exists idx_orders_order_number on orders (order_number);

create index if not exists idx_tasks_agent_completed
  on tasks (assigned_to, completed_at)
  where status in ('done', 'skipped', 'cancelled');

create index if not exists idx_agent_activity_logs_agent_created
  on agent_activity_logs (agent_id, created_at);

create index if not exists idx_call_logs_called_at on call_logs (called_at);

create index if not exists idx_webhook_logs_created_at on webhook_logs (created_at);
create index if not exists idx_webhook_logs_source_status on webhook_logs (source, status);
