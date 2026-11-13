-- Phase 1 security increment (from the Phase 0 audit, 2026-11-13).
--
-- 1. Privileged functions were executable without signing in.
--    Postgres grants EXECUTE to PUBLIC by default, so 29 SECURITY DEFINER
--    functions (which run with the owner's rights) could be called with
--    only the public anon key. Nothing in the app calls them signed out.
--    This removes anon and PUBLIC, and keeps exactly the access signed-in
--    users and the server role already had - nothing is widened.
--
-- 2. The rollup rebuilds rewrite reporting tables for every organisation and
--    are only ever run by the scheduled job (server role). Signed-in users
--    lose the ability to trigger them.
--
-- 3. Three tables still had the catch-all "auth_all" rule: any member of an
--    organisation could change or delete its product timing overrides,
--    pincode metrics and campaign recipient rows. Reading stays as it was;
--    writing is now admin-only, which is what the app already assumes
--    (Settings is admin-only, campaigns run through an admin-only API, and
--    the scheduled jobs use the server role, which row security does not bind).
--
-- 4. egress_watch's read rule was attached to the "public" role instead of
--    signed-in users.
--
-- Rollback: re-grant with
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
-- and recreate "auth_all" FOR ALL TO authenticated
--   USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id())
-- on the three tables. Safe to re-run.
BEGIN;

-- 1. No privileged function without a session.
DO $$
DECLARE
  f RECORD;
  authed BOOLEAN;
BEGIN
  FOR f IN
    SELECT p.oid, p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
  LOOP
    -- Remember what signed-in users could do before PUBLIC is removed.
    authed := has_function_privilege('authenticated', f.oid, 'execute');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    IF authed THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END $$;

-- 2. Reporting rebuilds: scheduled job only.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('rebuild_rollup_orders', 'rebuild_rollup_state_orders')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

-- 3. Read for the organisation, write for its admins.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_overrides', 'pincode_metrics', 'campaign_recipients'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_all" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read_own_org', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (org_id = public.current_org_id())', t || '_read_own_org', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_admin_write', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.is_admin()) WITH CHECK (org_id = public.current_org_id() AND public.is_admin())', t || '_admin_write', t);
  END LOOP;
END $$;

-- 4. Signed-in users only.
ALTER POLICY egress_watch_admin_read ON egress_watch TO authenticated;

COMMIT;
