-- Root cause of a real, silent, permanent order-sync failure found via
-- /api/admin/order-reconciliation: orders_fulfillment_status_check only
-- allowed ('unfulfilled','partial','fulfilled'), but Shopify's real API
-- returns 'restocked' for cancelled/returned orders where inventory was
-- restocked (also documents 'scheduled' as a valid value). Any order that
-- reached one of these statuses got rejected by this constraint on every
-- sync attempt, forever - sync-logic.ts's per-order try/catch logs the
-- error and moves on rather than halting the whole sync, so this failed
-- silently with no visible alert. Confirmed live: 5 of 189 orders missing
-- from production all failed on exactly this constraint, all with
-- fulfillment_status = 'restocked'.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_status_check
  CHECK (fulfillment_status IN ('unfulfilled', 'partial', 'fulfilled', 'restocked', 'scheduled'));
