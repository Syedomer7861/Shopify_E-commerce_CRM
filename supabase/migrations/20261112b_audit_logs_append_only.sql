-- Audit log: make it append-only for signed-in users.
--
-- The catch-all policy "auth_all" (FOR ALL) let any member of an
-- organisation UPDATE or DELETE that organisation's audit rows, so the trail
-- could be edited or erased by the people it records.
--
-- This replaces it with the two things the app actually does:
--   - INSERT a row for your own organisation
--   - SELECT rows of your own organisation (same reach as before - several
--     pages read the trail as a regular user, so reading is NOT narrowed here)
-- With no UPDATE or DELETE policy, row-level security refuses both. The
-- service role (webhooks, crons) is unaffected.
--
-- The app never updates or deletes audit rows. Safe to re-run.
BEGIN;

DROP POLICY IF EXISTS "auth_all" ON audit_logs;

DROP POLICY IF EXISTS "audit_logs_insert_own_org" ON audit_logs;
CREATE POLICY "audit_logs_insert_own_org" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "audit_logs_read_own_org" ON audit_logs;
CREATE POLICY "audit_logs_read_own_org" ON audit_logs
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

COMMIT;
