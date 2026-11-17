-- Dashboard builder role tests. Runs inside one transaction and ROLLS BACK.
-- Placeholders filled by check-kpi-roles.mjs (same test accounts):
--   __ADMIN__ admin of org A, __AGENT__ member of org A, __OTHER_ADMIN__ admin of org B.
BEGIN;
CREATE TEMP TABLE _r (n serial, k text, ok boolean, d text);
GRANT ALL ON _r TO authenticated;
GRANT USAGE ON SEQUENCE _r_n_seq TO authenticated;
CREATE TEMP TABLE _ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON _ids TO authenticated;
CREATE FUNCTION pg_temp.t(k text, ok boolean, d text DEFAULT '') RETURNS void LANGUAGE sql AS
  $f$ INSERT INTO _r (k, ok, d) VALUES (k, coalesce(ok, false), d) $f$;
CREATE FUNCTION pg_temp.id(k text) RETURNS uuid LANGUAGE sql AS $f$ SELECT id FROM _ids WHERE _ids.k = $1 $f$;
CREATE FUNCTION pg_temp.as_user(u uuid, aal text DEFAULT 'aal1') RETURNS void LANGUAGE sql AS
  $f$ SELECT set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', aal)::text, true) $f$;
INSERT INTO _ids VALUES ('owner', (SELECT id FROM profiles WHERE is_platform_admin LIMIT 1)),
  ('global', (SELECT id FROM dashboards WHERE org_id IS NULL AND status = 'published' ORDER BY name LIMIT 1)),
  ('orgb', (SELECT org_id FROM profiles WHERE id = '__OTHER_ADMIN__'));
-- Start clean for the test users: existing assignments would change what my_dashboard() returns.
DELETE FROM dashboard_assignments WHERE org_id IN (SELECT org_id FROM profiles WHERE id IN ('__ADMIN__', '__OTHER_ADMIN__'));
SET LOCAL ROLE authenticated;

-- ── Platform owner: global templates need a verified (aal2) session ────────
SELECT pg_temp.as_user(pg_temp.id('owner'), 'aal1');
DO $t$ DECLARE n int; BEGIN
  BEGIN INSERT INTO dashboards (org_id, name) VALUES (NULL, 'T global aal1'); PERFORM pg_temp.t('owner_aal1_cannot_create_global', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('owner_aal1_cannot_create_global', true, SQLERRM); END;
  UPDATE dashboards SET description = 'x' WHERE id = pg_temp.id('global'); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('owner_aal1_cannot_edit_global', n = 0);
END $t$;
SELECT pg_temp.as_user(pg_temp.id('owner'), 'aal2');
DO $t$ DECLARE g uuid := gen_random_uuid(); n int; BEGIN
  INSERT INTO dashboards (id, org_id, name) VALUES (g, NULL, 'T global draft');
  INSERT INTO _ids VALUES ('gdraft', g);
  PERFORM pg_temp.t('owner_aal2_creates_global_draft', EXISTS (SELECT 1 FROM dashboards WHERE id = g));
  UPDATE dashboards SET description = 'checked' WHERE id = pg_temp.id('global'); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('owner_aal2_edits_global', n = 1);
END $t$;

-- ── Org A admin: copy, publish, assign ─────────────────────────────────────
SELECT pg_temp.as_user('__ADMIN__');
DO $t$ DECLARE d1 uuid; d2 uuid := gen_random_uuid(); v int; n int; BEGIN
  PERFORM pg_temp.t('admin_cannot_see_global_draft', NOT EXISTS (SELECT 1 FROM dashboards WHERE id = pg_temp.id('gdraft')));
  d1 := public.dashboard_copy(pg_temp.id('global'), 'T copy');
  INSERT INTO _ids VALUES ('d1', d1), ('d2', d2);
  PERFORM pg_temp.t('admin_copies_template', (SELECT org_id = public.current_org_id() AND status = 'draft' AND source_dashboard_id = pg_temp.id('global') FROM dashboards WHERE id = d1));
  v := public.dashboard_publish(d1, 'first');
  PERFORM pg_temp.t('admin_publishes', v = 1 AND (SELECT status = 'published' AND published_layout IS NOT NULL FROM dashboards WHERE id = d1));
  PERFORM pg_temp.t('publish_writes_version', (SELECT count(*) FROM dashboard_versions WHERE dashboard_id = d1) = 1);
  UPDATE dashboard_versions SET note = 'edited' WHERE dashboard_id = d1; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('versions_cannot_be_edited', n = 0);
  DELETE FROM dashboard_versions WHERE dashboard_id = d1; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('versions_cannot_be_deleted', n = 0);
  BEGIN UPDATE dashboards SET org_id = pg_temp.id('orgb') WHERE id = d1; PERFORM pg_temp.t('admin_cannot_move_dashboard_to_other_org', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('admin_cannot_move_dashboard_to_other_org', true, SQLERRM); END;
  BEGIN INSERT INTO dashboards (org_id, name) VALUES (NULL, 'T sneaky global'); PERFORM pg_temp.t('admin_cannot_create_global', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('admin_cannot_create_global', true, SQLERRM); END;
  UPDATE dashboards SET name = 'Hacked' WHERE id = pg_temp.id('global'); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('admin_cannot_edit_global', n = 0);
  INSERT INTO dashboard_assignments (dashboard_id, target_type, target_key)
    VALUES (d1, 'role', (SELECT role FROM profiles WHERE id = '__AGENT__'));
  INSERT INTO dashboards (id, org_id, name, layout) VALUES (d2, public.current_org_id(), 'T personal', '[{"id":"w1","widget":"my-work","size":"full"}]');
  INSERT INTO dashboard_assignments (dashboard_id, target_type, target_key) VALUES (d2, 'employee', '__AGENT__');
  PERFORM pg_temp.t('admin_assigns', (SELECT count(*) FROM dashboard_assignments WHERE dashboard_id IN (d1, d2)) = 2);
END $t$;

-- ── Agent: reads, resolves, cannot write ───────────────────────────────────
SELECT pg_temp.as_user('__AGENT__');
DO $t$ DECLARE n int; BEGIN
  PERFORM pg_temp.t('agent_reads_published_templates', (SELECT count(*) FROM dashboards WHERE org_id IS NULL AND status = 'published') > 0);
  PERFORM pg_temp.t('agent_skips_unpublished_assignment', (SELECT matched = 'role' AND id = pg_temp.id('d1') FROM public.my_dashboard()));
  UPDATE dashboards SET name = 'Agent edit' WHERE id = pg_temp.id('d1'); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('agent_cannot_edit_dashboard', n = 0);
  BEGIN PERFORM public.dashboard_publish(pg_temp.id('d2'), ''); PERFORM pg_temp.t('agent_cannot_publish', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_publish', true, SQLERRM); END;
  BEGIN INSERT INTO dashboard_assignments (dashboard_id, target_type, target_key) VALUES (pg_temp.id('d2'), 'role', 'admin'); PERFORM pg_temp.t('agent_cannot_assign', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_assign', true, SQLERRM); END;
  BEGIN PERFORM public.dashboard_copy(pg_temp.id('global'), 'Agent copy'); PERFORM pg_temp.t('agent_cannot_copy', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_copy', true, SQLERRM); END;
END $t$;

SELECT pg_temp.as_user('__ADMIN__');
SELECT public.dashboard_publish(pg_temp.id('d2'), '');
SELECT pg_temp.as_user('__AGENT__');
DO $t$ BEGIN
  PERFORM pg_temp.t('employee_assignment_beats_role', (SELECT matched = 'employee' AND id = pg_temp.id('d2') FROM public.my_dashboard()));
END $t$;

-- ── Org B admin: sees and changes nothing of org A ─────────────────────────
SELECT pg_temp.as_user('__OTHER_ADMIN__');
DO $t$ DECLARE n int; BEGIN
  PERFORM pg_temp.t('other_org_cannot_see_dashboard', NOT EXISTS (SELECT 1 FROM dashboards WHERE id IN (pg_temp.id('d1'), pg_temp.id('d2'))));
  PERFORM pg_temp.t('other_org_cannot_see_assignments', NOT EXISTS (SELECT 1 FROM dashboard_assignments WHERE dashboard_id IN (pg_temp.id('d1'), pg_temp.id('d2'))));
  PERFORM pg_temp.t('other_org_cannot_see_versions', NOT EXISTS (SELECT 1 FROM dashboard_versions WHERE dashboard_id = pg_temp.id('d1')));
  UPDATE dashboards SET name = 'Cross-org' WHERE id = pg_temp.id('d1'); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('other_org_cannot_edit', n = 0);
  BEGIN INSERT INTO dashboard_assignments (dashboard_id, target_type, target_key) VALUES (pg_temp.id('d1'), 'role', 'agent'); PERFORM pg_temp.t('other_org_cannot_assign_foreign_dashboard', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('other_org_cannot_assign_foreign_dashboard', true, SQLERRM); END;
  BEGIN PERFORM public.dashboard_copy(pg_temp.id('d1'), 'Stolen'); PERFORM pg_temp.t('other_org_cannot_copy_foreign_dashboard', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('other_org_cannot_copy_foreign_dashboard', true, SQLERRM); END;
  BEGIN PERFORM public.dashboard_publish(pg_temp.id('d1'), ''); PERFORM pg_temp.t('other_org_cannot_publish_foreign', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('other_org_cannot_publish_foreign', true, SQLERRM); END;
  PERFORM pg_temp.t('other_org_gets_no_dashboard', NOT EXISTS (SELECT 1 FROM public.my_dashboard()));
END $t$;

RESET ROLE;
SELECT json_agg(_r ORDER BY n) AS results FROM _r;
ROLLBACK;
