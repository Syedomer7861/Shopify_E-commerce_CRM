BEGIN;
-- Message history and workflow logs were editable and deletable by any member of
-- the workspace (permissive org-only policies), so a member could rewrite or erase
-- what was sent to a customer. The app only ever INSERTs into these two tables
-- (lib/whatsapp.ts, lib/workflow-engine.ts), so edits and deletes are now admin-only.
-- workflow_instances keeps member updates (the workflow engine advances runs under
-- the member's session) but deleting a run becomes admin-only.
-- Additive: RESTRICTIVE policies only; existing policies and rows are untouched.
DROP POLICY IF EXISTS whatsapp_messages_admin_edit ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_admin_edit ON public.whatsapp_messages AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS whatsapp_messages_admin_delete ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_admin_delete ON public.whatsapp_messages AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS workflow_logs_admin_edit ON public.workflow_logs;
CREATE POLICY workflow_logs_admin_edit ON public.workflow_logs AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS workflow_logs_admin_delete ON public.workflow_logs;
CREATE POLICY workflow_logs_admin_delete ON public.workflow_logs AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS workflow_instances_admin_delete ON public.workflow_instances;
CREATE POLICY workflow_instances_admin_delete ON public.workflow_instances AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE TEMP TABLE _r (n serial, k text, ok boolean, d text);
GRANT ALL ON _r TO authenticated; GRANT USAGE ON SEQUENCE _r_n_seq TO authenticated;
CREATE TEMP TABLE _m (id uuid); GRANT ALL ON _m TO authenticated;
CREATE FUNCTION pg_temp.t(k text, ok boolean, d text DEFAULT '') RETURNS void LANGUAGE sql AS
  $f$ INSERT INTO _r (k, ok, d) VALUES (k, coalesce(ok, false), d) $f$;
CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS
  $f$ SELECT set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $f$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('__AGENT__');
DO $t$ DECLARE m uuid; n int; BEGIN
  INSERT INTO whatsapp_messages (phone, body, direction) VALUES ('0000000000', 'orig', 'outbound') RETURNING id INTO m;
  INSERT INTO _m VALUES (m);
  PERFORM pg_temp.t('agent_can_insert_message', m IS NOT NULL);
  UPDATE whatsapp_messages SET body = 'edited' WHERE id = m; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('agent_cannot_edit_message', n = 0, n::text);
  DELETE FROM whatsapp_messages WHERE id = m; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('agent_cannot_delete_message', n = 0, n::text);
  INSERT INTO workflow_logs (action_type, status) VALUES ('test', 'ok');
  PERFORM pg_temp.t('agent_can_insert_log', true);
  DELETE FROM workflow_logs WHERE action_type = 'test'; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('agent_cannot_delete_log', n = 0, n::text);
  PERFORM pg_temp.t('agent_can_still_read_messages', EXISTS (SELECT 1 FROM whatsapp_messages WHERE id = m));
END $t$;
SELECT pg_temp.as_user('__ADMIN__');
DO $t$ DECLARE n int; BEGIN
  UPDATE whatsapp_messages SET body = 'admin' WHERE id = (SELECT id FROM _m); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('admin_can_edit_message', n = 1, n::text);
  DELETE FROM workflow_logs WHERE action_type = 'test'; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('admin_can_delete_log', n = 1, n::text);
END $t$;
SELECT pg_temp.as_user('__OTHER_ADMIN__');
DO $t$ DECLARE n int; BEGIN
  UPDATE whatsapp_messages SET body = 'x' WHERE id = (SELECT id FROM _m); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('other_org_admin_cannot_edit', n = 0, n::text);
END $t$;
RESET ROLE;
SELECT json_agg(_r ORDER BY n) AS results FROM _r;
ROLLBACK;
