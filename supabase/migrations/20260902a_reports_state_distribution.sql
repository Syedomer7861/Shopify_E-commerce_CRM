-- Phase 2A-2a: server-side aggregate for the Reports "State Distribution" chart.
-- Was computed in the browser from every order row in the selected window.
-- Now: one SECURITY INVOKER function returning <= 12 aggregated rows + the
-- grand total, so the Reports page never downloads the order rows just to
-- group them by state.
--
-- REQUIRES migration 20260901b (rollup_daily_state_orders). Postgres validates
-- function bodies at CREATE time, so this file errors if 20260901b is not
-- applied - run it first.
--
-- SECURITY INVOKER: the function runs as the calling user. Every table it
-- reads - rollup_daily_state_orders, orders, customers - already grants
-- SELECT to authenticated (rollup_daily_state_orders_read; orders/customers
-- auth_all). No RLS is bypassed. EXECUTE is granted to `authenticated` only,
-- and the /api/reports/state-distribution route additionally enforces the
-- view_analytics permission before it is ever called.

CREATE OR REPLACE FUNCTION reports_state_distribution(
  p_start   date,
  p_end     date,
  p_state   text DEFAULT 'all',
  p_segment text DEFAULT 'all',
  p_payment text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_use_rollup boolean;
  v_result     jsonb;
BEGIN
  -- Rollup only carries state + orders + revenue (no segment / payment
  -- dimension), so it can serve the common unfiltered case; anything with a
  -- segment or payment filter falls to a live aggregate. Both paths return
  -- the same shape and at most 12 rows.
  v_use_rollup := (p_segment = 'all' AND p_payment = 'all')
                  AND EXISTS (SELECT 1 FROM rollup_daily_state_orders LIMIT 1);

  IF v_use_rollup THEN
    WITH agg AS (
      SELECT r.state,
             sum(r.orders)::bigint  AS orders,
             sum(r.revenue)::numeric AS revenue
      FROM rollup_daily_state_orders r
      WHERE r.day >= p_start
        AND r.day <= p_end
        AND (p_state = 'all' OR r.state = initcap(btrim(p_state)))
      GROUP BY r.state
    )
    SELECT jsonb_build_object(
      'source', 'rollup',
      'total_revenue', coalesce((SELECT sum(revenue) FROM agg), 0),
      'rows', coalesce((
        SELECT jsonb_agg(x ORDER BY x.revenue DESC)
        FROM (SELECT state, orders, revenue FROM agg ORDER BY revenue DESC LIMIT 12) x
      ), '[]'::jsonb)
    ) INTO v_result;
  ELSE
    WITH agg AS (
      SELECT initcap(btrim(c.state))  AS state,
             count(*)::bigint         AS orders,
             coalesce(sum(o.total_price), 0)::numeric AS revenue
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE (o.ordered_at AT TIME ZONE 'Asia/Kolkata')::date >= p_start
        AND (o.ordered_at AT TIME ZONE 'Asia/Kolkata')::date <= p_end
        AND btrim(coalesce(c.state, '')) <> ''
        AND (p_state   = 'all' OR c.state = p_state)
        AND (p_segment = 'all' OR c.segment = p_segment)
        AND (p_payment = 'all' OR o.payment_gateway =
              CASE WHEN p_payment = 'COD' THEN 'Cash on Delivery (COD)' ELSE 'Prepaid' END)
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'source', 'live',
      'total_revenue', coalesce((SELECT sum(revenue) FROM agg), 0),
      'rows', coalesce((
        SELECT jsonb_agg(x ORDER BY x.revenue DESC)
        FROM (SELECT state, orders, revenue FROM agg ORDER BY revenue DESC LIMIT 12) x
      ), '[]'::jsonb)
    ) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL     ON FUNCTION reports_state_distribution(date, date, text, text, text) FROM public;
GRANT  EXECUTE ON FUNCTION reports_state_distribution(date, date, text, text, text) TO authenticated;
