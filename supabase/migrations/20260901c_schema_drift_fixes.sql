-- Schema drift showing up as red rows in the Supabase logs:
--   * PATCH /workflow_instances -> "value too long for character varying(20)"
--     (fixed in code: workflow-engine clamps status now)
--   * GET /campaigns -> "column campaigns.scheduled_at does not exist"
--   * POST /rpc/refresh_customer_health_scores -> 404 (phase-5 never applied)
--   * GET /order_revenue_attribution?...order:orders(...) -> 400 (no FK)
-- Everything here is additive / idempotent.

-- 1. campaigns.scheduled_at -----------------------------------------------
-- 20260822_rls_gaps.sql declared it inside CREATE TABLE IF NOT EXISTS, which
-- was a no-op because campaigns already existed from 20260411. Add it now.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- 2. Phase-5 customer health score (column + function) -------------------
ALTER TABLE customers          ADD COLUMN IF NOT EXISTS health_score       integer DEFAULT 100;
ALTER TABLE product_overrides  ADD COLUMN IF NOT EXISTS inventory_quantity integer DEFAULT 100;

CREATE OR REPLACE FUNCTION refresh_customer_health_scores()
RETURNS void AS $$
BEGIN
    UPDATE customers
    SET health_score = GREATEST(0, LEAST(100,
        100
        - (CASE WHEN rto_flag THEN 40 ELSE 0 END)
        - (CASE WHEN last_order_date < (now() - INTERVAL '60 days') THEN 20 ELSE 0 END)
        + (CASE WHEN total_orders >= 5 THEN 20 ELSE 0 END)
        - (CASE WHEN rto_count > 0 THEN rto_count * 10 ELSE 0 END)
    ));
END;
$$ LANGUAGE plpgsql;

SELECT refresh_customer_health_scores();

-- 3. FK so order_revenue_attribution -> orders embeds resolve -----------
-- NOT VALID: enforced on new rows, existing rows trusted (all order_ids are
-- derived from real orders, but this avoids a full-table validation lock).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_revenue_attribution_order_id_fkey'
  ) THEN
    ALTER TABLE order_revenue_attribution
      ADD CONSTRAINT order_revenue_attribution_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

-- 4. Widen workflow_instances.status (defensive; code also clamps) ------
ALTER TABLE workflow_instances ALTER COLUMN status TYPE varchar(40);
