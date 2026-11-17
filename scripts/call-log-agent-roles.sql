BEGIN;
-- DRAFT, not applied. Additive only: two nullable columns, one index, one RESTRICTIVE guard.
-- 1) call_logs.agent_id: who logged the call. Filled by default from the caller's session,
--    so the existing app inserts need no change. Old rows stay NULL (no guessing from agent_name).
--    Cron jobs use the service client (no auth.uid()), so their rows stay NULL too.
-- 2) leaves.leave_type: optional; NULL = not specified (existing rows are not relabelled).
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS call_logs_agent_called_idx ON public.call_logs (agent_id, called_at DESC);

-- Members may only log calls as themselves (or leave it empty); admins may set anyone.
DROP POLICY IF EXISTS call_logs_agent_is_self ON public.call_logs;
CREATE POLICY call_logs_agent_is_self ON public.call_logs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (agent_id IS NULL OR agent_id = auth.uid() OR public.is_admin());

ALTER TABLE public.leaves
  ADD COLUMN IF NOT EXISTS leave_type text
  CHECK (leave_type IS NULL OR leave_type IN ('casual', 'sick', 'annual', 'unpaid', 'other'));

CREATE TEMP TABLE _r (n serial, k text, ok boolean, d text);
GRANT ALL ON _r TO authenticated; GRANT USAGE ON SEQUENCE _r_n_seq TO authenticated;
CREATE FUNCTION pg_temp.t(k text, ok boolean, d text DEFAULT '') RETURNS void LANGUAGE sql AS
  $f$ INSERT INTO _r (k, ok, d) VALUES (k, coalesce(ok, false), d) $f$;
CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS
  $f$ SELECT set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $f$;
CREATE TEMP TABLE _tk AS SELECT t.id, t.customer_id FROM tasks t JOIN profiles p ON p.id = '__AGENT__' WHERE t.org_id = p.org_id LIMIT 1;
GRANT SELECT ON _tk TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('__AGENT__');
DO $t$ DECLARE a uuid; BEGIN
  INSERT INTO call_logs (task_id, customer_id, outcome, note, called_at) SELECT id, customer_id, 'skipped', 'x', now() FROM _tk RETURNING agent_id INTO a;
  PERFORM pg_temp.t('agent_insert_defaults_to_self', a = '__AGENT__'::uuid, coalesce(a::text, 'null'));
  BEGIN INSERT INTO call_logs (task_id, customer_id, outcome, called_at, agent_id) SELECT id, customer_id, 'skipped', now(), '__ADMIN__' FROM _tk;
    PERFORM pg_temp.t('agent_cannot_log_as_other', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_log_as_other', true, SQLERRM); END;
  BEGIN INSERT INTO leaves (agent_id, start_date, end_date, reason, status, leave_type) VALUES ('__AGENT__', current_date, current_date, 't', 'pending', 'bogus');
    PERFORM pg_temp.t('leave_type_checked', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('leave_type_checked', true, SQLERRM); END;
  INSERT INTO leaves (agent_id, start_date, end_date, reason, status, leave_type) VALUES ('__AGENT__', current_date, current_date, 't', 'pending', 'sick');
  PERFORM pg_temp.t('agent_leave_with_type', true);
END $t$;
SELECT pg_temp.as_user('__ADMIN__');
DO $t$ DECLARE a uuid; BEGIN
  INSERT INTO call_logs (task_id, customer_id, outcome, called_at, agent_id) SELECT id, customer_id, 'skipped', now(), '__AGENT__' FROM _tk RETURNING agent_id INTO a;
  PERFORM pg_temp.t('admin_can_log_for_agent', a = '__AGENT__'::uuid);
  PERFORM pg_temp.t('old_rows_untouched', (SELECT count(*) FROM call_logs WHERE agent_id IS NOT NULL) = 2);
END $t$;
RESET ROLE;
SELECT json_agg(_r ORDER BY n) AS results FROM _r;
ROLLBACK;
