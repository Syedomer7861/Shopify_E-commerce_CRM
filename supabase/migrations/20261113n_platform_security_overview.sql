-- Super Admin security centre: one read-only snapshot for the owner.
--
-- platform_security_overview() returns jsonb with:
--   owners       every platform-admin account, two-factor on/off, last sign-in
--   accounts     totals: users, active, suspended, with two-factor; org admins with/without
--   sessions     live sessions (not expired, used in the last 7 days), by assurance level
--   isolation    the same four checks as scripts/check-tenancy-db.sql, run live
--                (keep the two in step); every row is a problem
--   rls_off      every public table with row security off (with or without org_id)
--   owner_actions owner actions in the last 7 days, by action
-- Nothing is changed. Gated by platform_require_owner() (owner flag + two-factor).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.platform_security_overview();
-- Safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.platform_security_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r jsonb;
BEGIN
  PERFORM public.platform_require_owner();

  WITH mfa AS (
    SELECT DISTINCT user_id FROM auth.mfa_factors WHERE status = 'verified'
  ), acc AS (
    SELECT p.id, p.email, p.role, p.is_active, p.is_platform_admin,
           u.last_sign_in_at, (u.banned_until IS NOT NULL AND u.banned_until > now()) AS suspended,
           (m.user_id IS NOT NULL) AS two_factor
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      LEFT JOIN mfa m ON m.user_id = p.id
  ), live AS (
    SELECT s.aal::text AS aal FROM auth.sessions s
     WHERE (s.not_after IS NULL OR s.not_after > now())
       AND coalesce(s.refreshed_at, s.updated_at, s.created_at) > now() - interval '7 days'
  ), iso AS (
    SELECT 'rls_off' AS problem, c.relname::text AS tbl, NULL::text AS policy
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT c.relrowsecurity
    UNION ALL
    SELECT 'open_policy', p.tablename::text, p.policyname::text
      FROM pg_policies p
     WHERE p.schemaname = 'public' AND (p.qual = 'true' OR p.with_check = 'true')
       AND p.roles && ARRAY['public', 'anon', 'authenticated']::name[]
    UNION ALL
    SELECT 'no_org_check', p.tablename::text, p.policyname::text
      FROM pg_policies p
      JOIN pg_class c ON c.relname = p.tablename AND c.relnamespace = 'public'::regnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
     WHERE p.schemaname = 'public' AND p.permissive = 'PERMISSIVE'
       AND p.roles && ARRAY['public', 'anon', 'authenticated']::name[]
       AND coalesce(p.qual, '') || coalesce(p.with_check, '') !~ '(current_org_id|org_id|is_platform_admin|is_platform_owner_verified|can_reach|can_access_space|is_space_owner|auth\.uid\(\) = user_id|user_id = auth\.uid\(\))'
    UNION ALL
    SELECT 'anon_definer_fn', p.proname::text, NULL
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'execute')
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'owners', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'email', email, 'two_factor', two_factor,
                          'last_sign_in_at', last_sign_in_at, 'suspended', suspended) ORDER BY email)
                        FROM acc WHERE is_platform_admin), '[]'::jsonb),
    'accounts', (SELECT jsonb_build_object(
        'total', count(*),
        'active', count(*) FILTER (WHERE is_active AND NOT suspended),
        'suspended', count(*) FILTER (WHERE suspended),
        'two_factor', count(*) FILTER (WHERE two_factor),
        'admins', count(*) FILTER (WHERE role = 'admin'),
        'admins_two_factor', count(*) FILTER (WHERE role = 'admin' AND two_factor),
        'never_signed_in', count(*) FILTER (WHERE last_sign_in_at IS NULL))
      FROM acc),
    'sessions', (SELECT jsonb_build_object('total', count(*), 'aal2', count(*) FILTER (WHERE aal = 'aal2')) FROM live),
    'isolation', coalesce((SELECT jsonb_agg(jsonb_build_object('problem', problem, 'table', tbl, 'policy', policy) ORDER BY problem, tbl) FROM iso), '[]'::jsonb),
    'rls_off', coalesce((SELECT jsonb_agg(c.relname ORDER BY c.relname) FROM pg_class c
                          WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT c.relrowsecurity), '[]'::jsonb),
    'owner_actions', coalesce((SELECT jsonb_agg(jsonb_build_object('action', action, 'count', n) ORDER BY n DESC)
                                 FROM (SELECT action, count(*) AS n FROM public.platform_audit_logs
                                        WHERE created_at > now() - interval '7 days' GROUP BY action) x), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_security_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_security_overview() TO authenticated;

COMMIT;
