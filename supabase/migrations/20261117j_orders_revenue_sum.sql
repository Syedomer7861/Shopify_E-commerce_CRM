-- Orders summary widget: revenue summed in the database instead of the
-- browser paging through up to 100,000 order rows.
--
-- SECURITY INVOKER: orders RLS decides which rows the caller can sum, exactly
-- as the old client-side select did. Read-only, additive.
-- Rollback: DROP FUNCTION IF EXISTS public.orders_revenue_sum(timestamptz, timestamptz);
BEGIN;

CREATE OR REPLACE FUNCTION public.orders_revenue_sum(p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT coalesce(sum(total_price), 0)
    FROM orders
   WHERE (p_from IS NULL OR created_at >= p_from)
     AND (p_to IS NULL OR created_at < p_to);
$$;

REVOKE ALL ON FUNCTION public.orders_revenue_sum(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orders_revenue_sum(timestamptz, timestamptz) TO authenticated;

COMMIT;
