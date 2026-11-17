-- KPI engine role tests. Runs inside one transaction and ROLLS BACK, so it
-- leaves no rows behind. Placeholders are filled by check-kpi-roles.mjs:
--   __ADMIN__        admin of org A
--   __AGENT__        member of org A without kpi manage/approve
--   __OTHER_ADMIN__  admin of a different org B
-- The platform owner is looked up (is_platform_admin) and tested with aal1/aal2.
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
  ('global', (SELECT id FROM kpi_templates WHERE org_id IS NULL AND status = 'published' ORDER BY name LIMIT 1));
SET LOCAL ROLE authenticated;

-- ── Platform owner: global library ──────────────────────────────────────────
SELECT pg_temp.as_user(pg_temp.id('owner'), 'aal1');
DO $t$ BEGIN
  BEGIN PERFORM public.platform_kpi_save_template(NULL, '{"name":"T global","items":[]}'); PERFORM pg_temp.t('owner_aal1_cannot_write_library', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('owner_aal1_cannot_write_library', true, SQLERRM); END;
END $t$;
SELECT pg_temp.as_user(pg_temp.id('owner'), 'aal2');
DO $t$ DECLARE g uuid; BEGIN
  g := public.platform_kpi_save_template(NULL, '{"name":"T global draft","period":"monthly","items":[{"name":"X","measurement":"numeric","default_target":5,"weight":100}]}');
  INSERT INTO _ids VALUES ('gdraft', g);
  PERFORM pg_temp.t('owner_aal2_creates_global_draft', g IS NOT NULL);
END $t$;

-- ── Agent (org A, no kpi manage) ───────────────────────────────────────────
SELECT pg_temp.as_user('__AGENT__');
DO $t$ BEGIN
  PERFORM pg_temp.t('agent_reads_published_library', (SELECT count(*) FROM kpi_templates WHERE org_id IS NULL AND status = 'published') > 0);
  PERFORM pg_temp.t('agent_cannot_see_global_draft', NOT EXISTS (SELECT 1 FROM kpi_templates WHERE id = pg_temp.id('gdraft')));
  BEGIN INSERT INTO kpi_templates (org_id, name) VALUES (NULL, 'T sneaky'); PERFORM pg_temp.t('agent_cannot_insert_global', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_insert_global', true, SQLERRM); END;
  BEGIN PERFORM public.platform_kpi_save_template(NULL, '{"name":"T","items":[]}'); PERFORM pg_temp.t('agent_cannot_call_platform_fn', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_call_platform_fn', true, SQLERRM); END;
  BEGIN PERFORM public.kpi_adopt_template(pg_temp.id('global')); PERFORM pg_temp.t('agent_cannot_adopt', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_adopt', true, SQLERRM); END;
  BEGIN PERFORM public.kpi_save_plan(NULL, '{"name":"T","items":[]}'); PERFORM pg_temp.t('agent_cannot_create_plan', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_create_plan', true, SQLERRM); END;
  BEGIN PERFORM public.kpi_suggest_all(); PERFORM pg_temp.t('agent_cannot_suggest_all', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_suggest_all', true, SQLERRM); END;
END $t$;

-- ── Admin (org A): adopt, plan, assign, evaluate ───────────────────────────
SELECT pg_temp.as_user('__ADMIN__');
DO $t$ DECLARE t uuid; p uuid; a uuid; i uuid; BEGIN
  t := public.kpi_adopt_template(pg_temp.id('global'));
  INSERT INTO _ids VALUES ('orgtpl', t);
  PERFORM pg_temp.t('admin_adopts_with_source', (SELECT source_template_id = pg_temp.id('global') AND org_id IS NOT NULL FROM kpi_templates WHERE id = t));
  p := public.kpi_save_plan(NULL, '{"name":"T plan","period":"monthly","items":[{"name":"A","measurement":"numeric","target":10,"weight":60},{"name":"B","measurement":"numeric","target":null,"weight":40}]}');
  INSERT INTO _ids VALUES ('plan', p);
  BEGIN PERFORM public.kpi_set_plan_status(p, 'active'); PERFORM pg_temp.t('activate_needs_targets', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('activate_needs_targets', true, SQLERRM); END;
  UPDATE kpi_plan_items SET target = 5 WHERE plan_id = p AND name = 'B';
  UPDATE kpi_plan_items SET weight = 30 WHERE plan_id = p AND name = 'B';
  BEGIN PERFORM public.kpi_set_plan_status(p, 'active'); PERFORM pg_temp.t('activate_needs_weights_100', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('activate_needs_weights_100', true, SQLERRM); END;
  UPDATE kpi_plan_items SET weight = 40 WHERE plan_id = p AND name = 'B';
  PERFORM public.kpi_set_plan_status(p, 'active');
  PERFORM pg_temp.t('admin_activates_plan', (SELECT status = 'active' FROM kpi_plans WHERE id = p));
  PERFORM public.kpi_assign(p, ARRAY['__AGENT__'::uuid], current_date - 40, true);
  SELECT id INTO a FROM kpi_assignments WHERE plan_id = p AND employee_id = '__AGENT__' AND status = 'active';
  INSERT INTO _ids VALUES ('asg', a);
  PERFORM pg_temp.t('admin_assigns_agent', a IS NOT NULL);
  PERFORM public.kpi_assign(p, ARRAY['__AGENT__'::uuid], current_date, true);
  PERFORM pg_temp.t('one_active_per_employee', (SELECT count(*) FROM kpi_assignments WHERE employee_id = '__AGENT__' AND status = 'active') = 1);
  BEGIN PERFORM public.kpi_save_plan(p, '{"name":"T plan","items":[]}'); PERFORM pg_temp.t('in_use_plan_not_editable', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('in_use_plan_not_editable', true, SQLERRM); END;
  SELECT id INTO i FROM kpi_plan_items WHERE plan_id = p AND name = 'A';
  INSERT INTO kpi_manual_values (plan_item_id, employee_id, period_start, period_end, value) VALUES (i, '__AGENT__', '2026-10-01', '2026-10-31', 7);
  INSERT INTO kpi_evaluations (assignment_id, employee_id, period_start, period_end, status, overall, band)
    VALUES (a, '__AGENT__', '2026-10-01', '2026-10-31', 'finalised', 70, 'needs_improvement');
  PERFORM pg_temp.t('finalise_stamps_who', (SELECT finalised_by = '__ADMIN__' OR finalised_by IS NULL FROM kpi_evaluations WHERE assignment_id = a));
  BEGIN UPDATE kpi_evaluations SET overall = 99 WHERE assignment_id = a; PERFORM pg_temp.t('finalised_not_updatable', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('finalised_not_updatable', true, SQLERRM); END;
  BEGIN DELETE FROM kpi_evaluations WHERE assignment_id = a; PERFORM pg_temp.t('finalised_not_deletable', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('finalised_not_deletable', true, SQLERRM); END;
  BEGIN UPDATE kpi_manual_values SET value = 9 WHERE plan_item_id = i; PERFORM pg_temp.t('manual_value_locked_after_finalise', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('manual_value_locked_after_finalise', true, SQLERRM); END;
  BEGIN DELETE FROM kpi_plan_items WHERE id = i; PERFORM pg_temp.t('item_with_values_not_deletable', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('item_with_values_not_deletable', true, SQLERRM); END;
END $t$;

-- ── Agent again: sees own records, can't touch them ────────────────────────
SELECT pg_temp.as_user('__AGENT__');
DO $t$ DECLARE n int; BEGIN
  PERFORM pg_temp.t('agent_sees_own_assignment', EXISTS (SELECT 1 FROM kpi_assignments WHERE id = pg_temp.id('asg')));
  PERFORM pg_temp.t('agent_sees_own_plan', EXISTS (SELECT 1 FROM kpi_plans WHERE id = pg_temp.id('plan')));
  PERFORM pg_temp.t('agent_sees_own_evaluation', EXISTS (SELECT 1 FROM kpi_evaluations WHERE assignment_id = pg_temp.id('asg')));
  BEGIN INSERT INTO kpi_evaluations (assignment_id, employee_id, period_start, period_end, status, overall)
      VALUES (pg_temp.id('asg'), '__AGENT__', '2026-09-01', '2026-09-30', 'draft', 100);
    PERFORM pg_temp.t('agent_cannot_self_evaluate', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_self_evaluate', true, SQLERRM); END;
  BEGIN INSERT INTO kpi_manual_values (plan_item_id, employee_id, period_start, period_end, value)
      SELECT id, '__AGENT__', '2026-11-01', '2026-11-30', 999 FROM kpi_plan_items WHERE plan_id = pg_temp.id('plan') LIMIT 1;
    PERFORM pg_temp.t('agent_cannot_enter_own_values', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_enter_own_values', true, SQLERRM); END;
  UPDATE kpi_assignments SET status = 'ended' WHERE id = pg_temp.id('asg');
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('agent_cannot_end_own_assignment', n = 0, n || ' rows');
  BEGIN PERFORM public.kpi_plan_new_version(pg_temp.id('plan')); PERFORM pg_temp.t('agent_cannot_version_plan', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('agent_cannot_version_plan', true, SQLERRM); END;
END $t$;

-- ── Other org admin: sees nothing of org A ─────────────────────────────────
SELECT pg_temp.as_user('__OTHER_ADMIN__');
DO $t$ DECLARE n int; BEGIN
  PERFORM pg_temp.t('other_org_no_template', NOT EXISTS (SELECT 1 FROM kpi_templates WHERE id = pg_temp.id('orgtpl')));
  PERFORM pg_temp.t('other_org_no_plan', NOT EXISTS (SELECT 1 FROM kpi_plans WHERE id = pg_temp.id('plan')));
  PERFORM pg_temp.t('other_org_no_items', NOT EXISTS (SELECT 1 FROM kpi_plan_items WHERE plan_id = pg_temp.id('plan')));
  PERFORM pg_temp.t('other_org_no_assignment', NOT EXISTS (SELECT 1 FROM kpi_assignments WHERE id = pg_temp.id('asg')));
  PERFORM pg_temp.t('other_org_no_evaluation', NOT EXISTS (SELECT 1 FROM kpi_evaluations WHERE assignment_id = pg_temp.id('asg')));
  PERFORM pg_temp.t('other_org_no_manual_values', NOT EXISTS (SELECT 1 FROM kpi_manual_values WHERE employee_id = '__AGENT__'));
  BEGIN PERFORM public.kpi_set_plan_status(pg_temp.id('plan'), 'archived'); PERFORM pg_temp.t('other_org_cannot_archive', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('other_org_cannot_archive', true, SQLERRM); END;
  BEGIN PERFORM public.kpi_plan_new_version(pg_temp.id('plan')); PERFORM pg_temp.t('other_org_cannot_version', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('other_org_cannot_version', true, SQLERRM); END;
  BEGIN PERFORM public.kpi_assign(pg_temp.id('plan'), ARRAY['__AGENT__'::uuid], current_date, true); PERFORM pg_temp.t('other_org_cannot_assign', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.t('other_org_cannot_assign', true, SQLERRM); END;
  UPDATE kpi_evaluations SET comments = 'x' WHERE assignment_id = pg_temp.id('asg');
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('other_org_cannot_touch_evaluation', n = 0, n || ' rows');
END $t$;

-- ── Admin: new version takes over, history kept ────────────────────────────
SELECT pg_temp.as_user('__ADMIN__');
DO $t$ DECLARE v uuid; p uuid := pg_temp.id('plan'); BEGIN
  v := public.kpi_plan_new_version(p);
  PERFORM public.kpi_set_plan_status(v, 'active');
  PERFORM pg_temp.t('version_moves_employee', EXISTS (SELECT 1 FROM kpi_assignments WHERE plan_id = v AND employee_id = '__AGENT__' AND status = 'active'));
  PERFORM pg_temp.t('old_version_archived', (SELECT status = 'archived' FROM kpi_plans WHERE id = p));
  PERFORM pg_temp.t('old_assignment_ended_not_deleted', EXISTS (SELECT 1 FROM kpi_assignments WHERE id = pg_temp.id('asg') AND status = 'ended'));
  PERFORM pg_temp.t('finalised_history_kept', EXISTS (SELECT 1 FROM kpi_evaluations WHERE assignment_id = pg_temp.id('asg') AND status = 'finalised' AND overall = 70));
  PERFORM pg_temp.t('audit_logged', (SELECT count(*) FROM audit_logs WHERE entity_type LIKE 'kpi_%' AND entity_id IN (p::text, v::text)) > 0);
END $t$;

RESET ROLE;
SELECT json_agg(_r ORDER BY n) AS results FROM _r;
ROLLBACK;
