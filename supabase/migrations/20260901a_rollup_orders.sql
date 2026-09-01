-- Nightly order rollup: one row per IST calendar day, so the Manager Hub
-- Logistics Pulse (and later dashboard/reports) reads ~250 rows/year instead
-- of paging the whole 20k+ orders table on every load. Purely derived and
-- disposable - rebuildable from orders at any time, never written by app code.

CREATE TABLE IF NOT EXISTS rollup_daily_orders (
  day           date PRIMARY KEY,
  orders_total  int  NOT NULL DEFAULT 0,
  delivered     int  NOT NULL DEFAULT 0,
  rto           int  NOT NULL DEFAULT 0,
  ndr           int  NOT NULL DEFAULT 0,
  in_transit    int  NOT NULL DEFAULT 0,
  revenue       numeric NOT NULL DEFAULT 0,
  by_courier    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "<raw courier_name>": {total,delivered,rto} }
  by_status     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "<delivery_status>": count }
  rebuilt_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rollup_daily_orders ENABLE ROW LEVEL SECURITY;

-- Read: any signed-in internal user (same tier as the orders table itself).
-- Write: only the service_role, via rebuild_rollup_orders() below.
DROP POLICY IF EXISTS rollup_daily_orders_read ON rollup_daily_orders;
CREATE POLICY rollup_daily_orders_read ON rollup_daily_orders
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION rebuild_rollup_orders(since date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  n int;
BEGIN
  WITH src AS (
    SELECT
      (ordered_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
      lower(coalesce(delivery_status, 'pending'))     AS st,
      nullif(btrim(coalesce(courier_name, '')), '')   AS courier,
      coalesce(total_price, 0)                         AS price
    FROM orders
    WHERE (ordered_at AT TIME ZONE 'Asia/Kolkata')::date >= since
  ),
  day_totals AS (
    SELECT
      day,
      count(*)                                                    AS orders_total,
      count(*) FILTER (WHERE st = 'delivered')                    AS delivered,
      count(*) FILTER (WHERE st = 'rto')                          AS rto,
      count(*) FILTER (WHERE st LIKE '%ndr%')                     AS ndr,
      count(*) FILTER (WHERE st IN ('in_transit','in-transit','out_for_delivery','shipped')) AS in_transit,
      coalesce(sum(price), 0)                                     AS revenue
    FROM src
    GROUP BY day
  ),
  status_map AS (
    SELECT day, jsonb_object_agg(st, c) AS m
    FROM (SELECT day, st, count(*) AS c FROM src GROUP BY day, st) a
    GROUP BY day
  ),
  courier_map AS (
    SELECT day, jsonb_object_agg(courier, cj) AS m
    FROM (
      SELECT day, courier,
        jsonb_build_object(
          'total',     count(*),
          'delivered', count(*) FILTER (WHERE st = 'delivered'),
          'rto',       count(*) FILTER (WHERE st = 'rto')
        ) AS cj
      FROM src
      WHERE courier IS NOT NULL
      GROUP BY day, courier
    ) b
    GROUP BY day
  )
  INSERT INTO rollup_daily_orders
    (day, orders_total, delivered, rto, ndr, in_transit, revenue, by_status, by_courier, rebuilt_at)
  SELECT
    t.day, t.orders_total, t.delivered, t.rto, t.ndr, t.in_transit, t.revenue,
    coalesce(s.m, '{}'::jsonb), coalesce(c.m, '{}'::jsonb), now()
  FROM day_totals t
  LEFT JOIN status_map  s USING (day)
  LEFT JOIN courier_map c USING (day)
  ON CONFLICT (day) DO UPDATE SET
    orders_total = excluded.orders_total,
    delivered    = excluded.delivered,
    rto          = excluded.rto,
    ndr          = excluded.ndr,
    in_transit   = excluded.in_transit,
    revenue      = excluded.revenue,
    by_status    = excluded.by_status,
    by_courier   = excluded.by_courier,
    rebuilt_at   = now();

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION rebuild_rollup_orders(date) FROM public;
GRANT EXECUTE ON FUNCTION rebuild_rollup_orders(date) TO service_role;

-- One-time full backfill (ordered_at is NOT NULL, so this covers all history).
SELECT rebuild_rollup_orders('2000-01-01');
