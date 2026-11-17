-- orders_revenue_sum rehearsal + role tests. One transaction, ROLLS BACK.
-- Placeholders filled by check-kpi-roles.mjs: __ADMIN__ (org A), __AGENT__ (org A), __OTHER_ADMIN__ (org B).
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

CREATE TEMP TABLE _r (n serial, k text, ok boolean, d text);
GRANT ALL ON _r TO authenticated, anon;
GRANT USAGE ON SEQUENCE _r_n_seq TO authenticated, anon;
CREATE FUNCTION pg_temp.t(k text, ok boolean, d text DEFAULT '') RETURNS void LANGUAGE sql AS
  $f$ INSERT INTO _r (k, ok, d) VALUES (k, coalesce(ok, false), d) $f$;
CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS
  $f$ SELECT set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true) $f$;
SET LOCAL ROLE authenticated;

-- Each user's sum must equal what they could add up themselves through RLS.
SELECT pg_temp.as_user('__ADMIN__');
DO $t$ DECLARE f numeric; d numeric; m timestamptz := date_trunc('month', now()); BEGIN
  f := public.orders_revenue_sum(); d := (SELECT coalesce(sum(total_price), 0) FROM orders);
  PERFORM pg_temp.t('admin_all_time_matches_rls_sum', f = d, f || ' vs ' || d);
  f := public.orders_revenue_sum(m, NULL); d := (SELECT coalesce(sum(total_price), 0) FROM orders WHERE created_at >= m);
  PERFORM pg_temp.t('admin_month_matches_rls_sum', f = d, f || ' vs ' || d);
  f := public.orders_revenue_sum(m - interval '30 days', m); d := (SELECT coalesce(sum(total_price), 0) FROM orders WHERE created_at >= m - interval '30 days' AND created_at < m);
  PERFORM pg_temp.t('admin_range_matches_rls_sum', f = d, f || ' vs ' || d);
END $t$;
SELECT pg_temp.as_user('__AGENT__');
DO $t$ DECLARE f numeric; d numeric; BEGIN
  f := public.orders_revenue_sum(); d := (SELECT coalesce(sum(total_price), 0) FROM orders);
  PERFORM pg_temp.t('agent_matches_rls_sum', f = d, f || ' vs ' || d);
END $t$;
SELECT pg_temp.as_user('__OTHER_ADMIN__');
DO $t$ DECLARE f numeric; d numeric; BEGIN
  f := public.orders_revenue_sum(); d := (SELECT coalesce(sum(total_price), 0) FROM orders);
  PERFORM pg_temp.t('other_org_matches_own_rls_sum', f = d, f || ' vs ' || d);
END $t$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $t$ BEGIN
  PERFORM public.orders_revenue_sum();
  PERFORM pg_temp.t('anon_cannot_execute', false, 'allowed');
EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('anon_cannot_execute', true, SQLERRM); END $t$;

RESET ROLE;
SELECT json_agg(_r ORDER BY n) AS results FROM _r;
ROLLBACK;
