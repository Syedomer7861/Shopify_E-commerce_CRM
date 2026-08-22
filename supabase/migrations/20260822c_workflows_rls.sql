-- ============================================================
-- Last table left exposed after 20260822b: public.workflows had RLS off and
-- no policies at all, so 20260822b skipped it on purpose — enabling RLS with
-- no policy locks every client out of the table.
--
-- Give it a policy first, then switch RLS on.
--
-- Safe for the app:
--   /api/workflows runs on the cookie client, so it is the authenticated
--   role and matches this policy. It is already gated by requireInternal().
--   WorkflowEngine is called from the webhook, cron and sync routes, which
--   now use the service-role client and bypass RLS entirely.
-- ============================================================

DROP POLICY IF EXISTS "auth_all_workflows" ON workflows;
CREATE POLICY "auth_all_workflows" ON workflows
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

-- The related tables were created by the same never-applied migration, so
-- cover them too if they exist.
DO $wf$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workflow_steps', 'workflow_instances', 'workflow_logs']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'auth_all_' || t, t);
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        'auth_all_' || t, t
      );
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE 'RLS enabled on %', t;
    END IF;
  END LOOP;
END
$wf$;

-- ------------------------------------------------------------
-- Verify. This should now return zero rows.
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
