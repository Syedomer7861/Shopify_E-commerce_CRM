-- ============================================================
-- CRITICAL: enable RLS on every public table that has policies.
--
-- Supabase Advisor reports "Policy Exists RLS Disabled" for customers,
-- orders, settings, raw_call_logs and others: the policies were created but
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY never ran, so the policies do
-- nothing and the tables are fully readable and writable with the anon key,
-- which ships in the browser bundle.
--
-- Run AFTER 20260822_rls_gaps.sql, which creates the missing tables and
-- policies this then switches on. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Turn RLS on wherever policies already exist.
--    Doing it dynamically catches every affected table, including ones not
--    listed on the Advisor page.
-- ------------------------------------------------------------
DO $rls$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS tbl, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t.tbl);
    RAISE NOTICE 'RLS enabled on %', t.relname;
  END LOOP;
END
$rls$;

-- ------------------------------------------------------------
-- 2. Report tables that are still unprotected because they have no policies
--    at all. RLS is deliberately NOT enabled on these: with no policy,
--    enabling it would lock the app out of the table entirely.
--    Read the notices, then decide per table.
-- ------------------------------------------------------------
DO $report$
DECLARE
  t record;
  found boolean := false;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
    ORDER BY c.relname
  LOOP
    found := true;
    RAISE WARNING 'NO RLS AND NO POLICY: public.% is readable with the anon key', t.relname;
  END LOOP;

  IF NOT found THEN
    RAISE NOTICE 'Every public table now has RLS enabled.';
  END IF;
END
$report$;

-- ------------------------------------------------------------
-- 3. Views run with the privileges of their owner unless declared otherwise,
--    which lets them leak past RLS. Force them to respect the caller.
-- ------------------------------------------------------------
DO $views$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT c.oid::regclass AS view_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW %s SET (security_invoker = true)', v.view_name);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not set security_invoker on %: %', v.view_name, SQLERRM;
    END;
  END LOOP;
END
$views$;

-- ------------------------------------------------------------
-- 4. Verify. Every row returned here is still exposed.
-- ------------------------------------------------------------
SELECT
  c.relname                                                   AS table_name,
  c.relrowsecurity                                            AS rls_enabled,
  (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;
