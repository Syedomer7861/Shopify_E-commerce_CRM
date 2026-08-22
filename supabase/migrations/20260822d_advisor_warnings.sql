-- ============================================================
-- Security Advisor cleanup: 46 warnings.
--
-- Safe to re-run. Read the notes before running: section 2 is the one that
-- could lock the app out if it is done carelessly, and section 4 only
-- diagnoses, it does not change anything.
-- ============================================================

-- ------------------------------------------------------------
-- 1. "Function Search Path Mutable"
--
-- A SECURITY DEFINER function without a fixed search_path runs whatever
-- schema the caller puts first, so a user who can create a schema can shadow
-- a table name and have the function operate on their own object with the
-- owner's privileges. Pinning search_path closes that.
--
-- is_admin() and has_role() already set it; these are the six that do not.
-- ALTER FUNCTION only changes the setting, it does not touch the body.
-- ------------------------------------------------------------
DO $sp$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_updated_at',
        'update_updated_at_column',
        'is_channel_member',
        'update_channel_last_message',
        'add_new_user_to_announcements',
        'create_manager_audit_task',
        'rls_auto_enable'
      )
      -- Only those missing a search_path setting.
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) AS c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.sig);
    RAISE NOTICE 'search_path pinned on %', fn.sig;
  END LOOP;
END
$sp$;

-- ------------------------------------------------------------
-- 2. "Public Can Execute SECURITY DEFINER Function"
--
-- CAREFUL. These helpers are called from inside RLS policies, and a policy
-- expression is evaluated as the *calling* role. Revoking EXECUTE from
-- `authenticated` would make every policy that calls is_admin() fail, which
-- locks signed-in users out of their own data.
--
-- So: revoke from PUBLIC and anon, keep authenticated. That clears the
-- "Public Can Execute" warnings. The "Signed-In Users Can Execute" warnings
-- will remain, and they should — that access is required for RLS to work.
-- ------------------------------------------------------------
DO $ex$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef                     -- SECURITY DEFINER only
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.sig);
    RAISE NOTICE 'anon EXECUTE revoked on %', fn.sig;
  END LOOP;

  -- Re-grant only what RLS policies actually call.
  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
  END IF;
  IF to_regprocedure('public.has_role(text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;
  END IF;
  IF to_regprocedure('public.is_channel_member(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.is_channel_member(uuid) TO authenticated;
  END IF;
END
$ex$;

-- ------------------------------------------------------------
-- 3. "Public Bucket Allows Listing" - storage.chat-attachments
--
-- A broad SELECT policy on storage.objects lets any client list every file in
-- the bucket. Chat attachments are internal, so restrict reads to signed-in
-- users. Skipped silently if the storage policies are managed elsewhere.
-- ------------------------------------------------------------
DO $st$
BEGIN
  EXECUTE $q$DROP POLICY IF EXISTS "chat_attachments_public_read" ON storage.objects$q$;
  EXECUTE $q$DROP POLICY IF EXISTS "chat_attachments_auth_read" ON storage.objects$q$;
  EXECUTE $q$
    CREATE POLICY "chat_attachments_auth_read" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'chat-attachments')
  $q$;
  RAISE NOTICE 'chat-attachments reads restricted to authenticated';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Storage policy not changed (%). Set the bucket to Private in the dashboard instead.', SQLERRM;
END
$st$;

-- ------------------------------------------------------------
-- 4. DIAGNOSTIC ONLY - the "read-only transaction" flood.
--
-- The logs are full of:
--     cannot execute ALTER TABLE in a read-only transaction   (25006)
--     cannot execute CREATE TABLE in a read-only transaction
--
-- PostgREST runs every GET inside a READ ONLY transaction, so something is
-- attempting DDL during ordinary reads. public.rls_auto_enable() appears in
-- the Advisor list and is the likely culprit, probably wired to an event
-- trigger. These queries show what exists; nothing is dropped automatically,
-- because removing the wrong trigger could disable protection you want.
-- ------------------------------------------------------------
SELECT 'EVENT TRIGGERS' AS report, evtname AS name, evtevent AS fires_on,
       evtenabled AS enabled, p.proname AS function_name
FROM pg_event_trigger e
JOIN pg_proc p ON p.oid = e.evtfoid;

SELECT 'rls_auto_enable SOURCE' AS report, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable';

-- Confirms the unique constraint the task inserts keep colliding with
-- ("duplicate key value violates unique constraint unique_order_task").
SELECT 'unique_order_task' AS report, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname = 'unique_order_task';
