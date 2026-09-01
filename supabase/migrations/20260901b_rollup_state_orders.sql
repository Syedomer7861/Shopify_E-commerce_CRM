-- Per-state daily order rollup, feeding the India Sales Map (Manager Hub +
-- Reports). Same rationale as rollup_daily_orders: the /api/analytics/geospatial
-- route pages thousands of joined order+customer rows on every load and every
-- time the day-range selector changes. Derived + disposable.

CREATE TABLE IF NOT EXISTS rollup_daily_state_orders (
  day      date    NOT NULL,
  state    text    NOT NULL,
  orders   int     NOT NULL DEFAULT 0,
  revenue  numeric NOT NULL DEFAULT 0,
  rto      int     NOT NULL DEFAULT 0,
  PRIMARY KEY (day, state)
);

ALTER TABLE rollup_daily_state_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rollup_daily_state_orders_read ON rollup_daily_state_orders;
CREATE POLICY rollup_daily_state_orders_read ON rollup_daily_state_orders
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION rebuild_rollup_state_orders(since date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  n int;
BEGIN
  -- Re-aggregation can produce a different set of states per day (orders
  -- reassigned to another customer/state), so clear the window first rather
  -- than relying on ON CONFLICT, which would leave stale (day, state) rows.
  DELETE FROM rollup_daily_state_orders WHERE day >= since;

  INSERT INTO rollup_daily_state_orders (day, state, orders, revenue, rto)
  SELECT
    (o.ordered_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
    initcap(btrim(c.state))                          AS state,
    count(*)                                         AS orders,
    coalesce(sum(o.total_price), 0)                  AS revenue,
    count(*) FILTER (WHERE lower(o.delivery_status) = 'rto') AS rto
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  WHERE (o.ordered_at AT TIME ZONE 'Asia/Kolkata')::date >= since
    AND btrim(coalesce(c.state, '')) <> ''
  GROUP BY 1, 2;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION rebuild_rollup_state_orders(date) FROM public;
GRANT EXECUTE ON FUNCTION rebuild_rollup_state_orders(date) TO service_role;

-- One-time full backfill.
SELECT rebuild_rollup_state_orders('2000-01-01');
