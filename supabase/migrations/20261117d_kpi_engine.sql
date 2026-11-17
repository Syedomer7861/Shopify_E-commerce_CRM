-- KPI engine, phase 1: templates (global + organisation), plans, assignments,
-- evaluations, manual values. Plan: docs/KPI_ENGINE_PLAN.md.
--
-- Levels:
--   kpi_templates.org_id IS NULL   global library. Written only by the platform
--                                  owner through platform_kpi_* (aal2, audited).
--   kpi_templates.org_id = org     an organisation's own or adopted copy; keeps
--                                  source_template_id + source_version, so a new
--                                  global version never overwrites it.
--   kpi_plans / kpi_assignments    HR: plan per department/designation, assigned
--                                  to employees with effective dates.
--
-- Permissions use a new grant module `kpi` (view / manage / approve) through
-- has_perm / can_reach; admins always pass. Finalised evaluations can't be
-- changed or deleted (trigger). Targets in the seed are NULL on purpose: an
-- organisation sets its own; nothing is scored until it does.
--
-- Additive only. Rollback:
--   DROP FUNCTION IF EXISTS public.platform_kpi_save_template(uuid, jsonb),
--     public.platform_kpi_set_status(uuid, text), public.platform_kpi_copy(uuid, boolean),
--     public.kpi_evaluation_guard(), public.kpi_touch();
--   DROP TABLE IF EXISTS public.kpi_manual_values, public.kpi_evaluations, public.kpi_assignments,
--     public.kpi_plan_items, public.kpi_plans, public.kpi_template_items, public.kpi_templates;

BEGIN;

-- ── Tables ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kpi_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  family_id          uuid NOT NULL DEFAULT gen_random_uuid(),
  version            int  NOT NULL DEFAULT 1 CHECK (version >= 1),
  source_template_id uuid REFERENCES public.kpi_templates(id) ON DELETE SET NULL,
  source_version     int,
  name               text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  collection         text NOT NULL DEFAULT '',
  description        text NOT NULL DEFAULT '',
  department_hint    text,
  designation_hints  text[] NOT NULL DEFAULT '{}',
  industry           text,
  period             text NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly','monthly','quarterly','half_yearly','yearly')),
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  visibility         text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','hidden')),
  created_by         uuid DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kpi_templates_family_version
  ON public.kpi_templates (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), family_id, version);
CREATE INDEX IF NOT EXISTS kpi_templates_org ON public.kpi_templates (org_id, status);

CREATE TABLE IF NOT EXISTS public.kpi_template_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    uuid NOT NULL REFERENCES public.kpi_templates(id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description    text NOT NULL DEFAULT '',
  source_key     text,          -- NULL = manual evaluation; unknown key = data source not configured
  measurement    text NOT NULL CHECK (measurement IN ('numeric','percentage','currency','time','rating','boolean','milestone')),
  direction      text NOT NULL DEFAULT 'higher' CHECK (direction IN ('higher','lower')),
  unit           text NOT NULL DEFAULT '',
  default_target numeric,
  weight         numeric NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
  cap            numeric CHECK (cap IS NULL OR cap > 0),
  threshold      numeric CHECK (threshold IS NULL OR threshold >= 0),
  missing_rule   text NOT NULL DEFAULT 'exclude' CHECK (missing_rule IN ('exclude','zero')),
  sort_order     int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS kpi_template_items_template ON public.kpi_template_items (template_id, sort_order);

CREATE TABLE IF NOT EXISTS public.kpi_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  template_id      uuid REFERENCES public.kpi_templates(id) ON DELETE SET NULL,
  template_version int,
  department_id    uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  designation_id   uuid REFERENCES public.designations(id) ON DELETE SET NULL,
  period           text NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly','monthly','quarterly','half_yearly','yearly')),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  approved_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at      timestamptz,
  created_by       uuid DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kpi_plans_org ON public.kpi_plans (org_id, status);

CREATE TABLE IF NOT EXISTS public.kpi_plan_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      uuid NOT NULL REFERENCES public.kpi_plans(id) ON DELETE CASCADE,
  org_id       uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description  text NOT NULL DEFAULT '',
  source_key   text,
  measurement  text NOT NULL CHECK (measurement IN ('numeric','percentage','currency','time','rating','boolean','milestone')),
  direction    text NOT NULL DEFAULT 'higher' CHECK (direction IN ('higher','lower')),
  unit         text NOT NULL DEFAULT '',
  target       numeric,
  weight       numeric NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
  cap          numeric CHECK (cap IS NULL OR cap > 0),
  threshold    numeric CHECK (threshold IS NULL OR threshold >= 0),
  missing_rule text NOT NULL DEFAULT 'exclude' CHECK (missing_rule IN ('exclude','zero')),
  sort_order   int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS kpi_plan_items_plan ON public.kpi_plan_items (plan_id, sort_order);

CREATE TABLE IF NOT EXISTS public.kpi_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id          uuid NOT NULL REFERENCES public.kpi_plans(id) ON DELETE RESTRICT,
  employee_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  effective_from   date NOT NULL DEFAULT current_date,
  effective_to     date CHECK (effective_to IS NULL OR effective_to >= effective_from),
  target_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { plan_item_id: target }
  status           text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','active','ended')),
  reason           text NOT NULL DEFAULT '',
  assigned_by      uuid DEFAULT auth.uid(),
  approved_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kpi_assignments_employee ON public.kpi_assignments (org_id, employee_id, status);

CREATE TABLE IF NOT EXISTS public.kpi_evaluations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.kpi_assignments(id) ON DELETE RESTRICT,
  employee_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start  date NOT NULL,
  period_end    date NOT NULL CHECK (period_end >= period_start),
  snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- rules + actuals + scores as evaluated
  overall       numeric,
  band          text,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','finalised')),
  comments      text NOT NULL DEFAULT '',
  evaluator_id  uuid DEFAULT auth.uid(),
  finalised_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalised_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS kpi_evaluations_employee ON public.kpi_evaluations (org_id, employee_id, period_start);

CREATE TABLE IF NOT EXISTS public.kpi_manual_values (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_item_id  uuid NOT NULL REFERENCES public.kpi_plan_items(id) ON DELETE CASCADE,
  employee_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start  date NOT NULL,
  period_end    date NOT NULL CHECK (period_end >= period_start),
  value         numeric NOT NULL,
  note          text NOT NULL DEFAULT '',
  entered_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_item_id, employee_id, period_start, period_end)
);

-- ── Integrity triggers ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kpi_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- Finalised evaluations are history: no edits, no deletes. Also pins
-- employee/org so a row can't be moved to someone else.
CREATE OR REPLACE FUNCTION public.kpi_evaluation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'finalised' THEN
    RAISE EXCEPTION 'Finalised evaluations cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.employee_id <> OLD.employee_id OR NEW.org_id <> OLD.org_id OR NEW.assignment_id <> OLD.assignment_id THEN
    RAISE EXCEPTION 'Evaluation owner cannot change' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'finalised' THEN
    NEW.finalised_at := now();
    NEW.finalised_by := auth.uid();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS kpi_evaluations_guard ON public.kpi_evaluations;
CREATE TRIGGER kpi_evaluations_guard BEFORE UPDATE OR DELETE ON public.kpi_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.kpi_evaluation_guard();

-- Same-org references: a plan item, assignment, evaluation or manual value
-- may only point at rows of its own organisation.
CREATE OR REPLACE FUNCTION public.kpi_ref_org_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean := true;
BEGIN
  IF TG_TABLE_NAME = 'kpi_plan_items' THEN
    ok := EXISTS (SELECT 1 FROM kpi_plans WHERE id = NEW.plan_id AND org_id = NEW.org_id);
  ELSIF TG_TABLE_NAME = 'kpi_plans' THEN
    ok := (NEW.department_id IS NULL OR EXISTS (SELECT 1 FROM departments WHERE id = NEW.department_id AND org_id = NEW.org_id))
      AND (NEW.designation_id IS NULL OR EXISTS (SELECT 1 FROM designations WHERE id = NEW.designation_id AND org_id = NEW.org_id))
      AND (NEW.template_id IS NULL OR EXISTS (SELECT 1 FROM kpi_templates WHERE id = NEW.template_id AND (org_id = NEW.org_id OR org_id IS NULL)));
  ELSIF TG_TABLE_NAME = 'kpi_assignments' THEN
    ok := EXISTS (SELECT 1 FROM kpi_plans WHERE id = NEW.plan_id AND org_id = NEW.org_id)
      AND EXISTS (SELECT 1 FROM profiles WHERE id = NEW.employee_id AND org_id = NEW.org_id);
  ELSIF TG_TABLE_NAME = 'kpi_evaluations' THEN
    ok := EXISTS (SELECT 1 FROM kpi_assignments WHERE id = NEW.assignment_id AND org_id = NEW.org_id AND employee_id = NEW.employee_id);
  ELSIF TG_TABLE_NAME = 'kpi_manual_values' THEN
    ok := EXISTS (SELECT 1 FROM kpi_plan_items WHERE id = NEW.plan_item_id AND org_id = NEW.org_id)
      AND EXISTS (SELECT 1 FROM profiles WHERE id = NEW.employee_id AND org_id = NEW.org_id);
  END IF;
  IF NOT ok THEN RAISE EXCEPTION 'KPI reference belongs to another organisation' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.kpi_ref_org_check() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kpi_plans','kpi_plan_items','kpi_assignments','kpi_evaluations','kpi_manual_values'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_kpi_ref_' || t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.kpi_ref_org_check()', 'trg_kpi_ref_' || t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['kpi_templates','kpi_plans','kpi_assignments','kpi_manual_values'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_kpi_touch_' || t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.kpi_touch()', 'trg_kpi_touch_' || t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['kpi_templates','kpi_plans','kpi_plan_items','kpi_assignments','kpi_evaluations','kpi_manual_values'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', 'trg_audit_' || t, t);
  END LOOP;
END $$;

-- ── RLS ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kpi_templates','kpi_template_items','kpi_plans','kpi_plan_items','kpi_assignments','kpi_evaluations','kpi_manual_values'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Templates: published global ones for everyone signed in; every global one
-- for the verified owner; an org's own ones for kpi viewers. Writes: org
-- rows only, by kpi managers. Global rows have no write policy at all.
DROP POLICY IF EXISTS kpi_templates_read ON public.kpi_templates;
CREATE POLICY kpi_templates_read ON public.kpi_templates FOR SELECT TO authenticated USING (
  (org_id IS NULL AND status = 'published' AND visibility = 'public')
  OR (org_id IS NULL AND public.is_platform_owner_verified())
  OR (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('kpi','view'))));
DROP POLICY IF EXISTS kpi_templates_write ON public.kpi_templates;
CREATE POLICY kpi_templates_write ON public.kpi_templates FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('kpi','manage')))
  WITH CHECK (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('kpi','manage')));

DROP POLICY IF EXISTS kpi_template_items_read ON public.kpi_template_items;
CREATE POLICY kpi_template_items_read ON public.kpi_template_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.kpi_templates t WHERE t.id = template_id));   -- inherits the template's read policy
DROP POLICY IF EXISTS kpi_template_items_write ON public.kpi_template_items;
CREATE POLICY kpi_template_items_write ON public.kpi_template_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.kpi_templates t WHERE t.id = template_id AND t.org_id = public.current_org_id())
         AND (public.is_admin() OR public.has_perm('kpi','manage')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.kpi_templates t WHERE t.id = template_id AND t.org_id = public.current_org_id())
         AND (public.is_admin() OR public.has_perm('kpi','manage')));

-- Plans: kpi viewers of the org, plus any employee assigned to the plan.
-- Activating a plan needs approve.
DROP POLICY IF EXISTS kpi_plans_read ON public.kpi_plans;
CREATE POLICY kpi_plans_read ON public.kpi_plans FOR SELECT TO authenticated USING (
  org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('kpi','view')
    OR EXISTS (SELECT 1 FROM public.kpi_assignments a WHERE a.plan_id = kpi_plans.id AND a.employee_id = auth.uid())));
DROP POLICY IF EXISTS kpi_plans_write ON public.kpi_plans;
CREATE POLICY kpi_plans_write ON public.kpi_plans FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('kpi','manage')))
  WITH CHECK (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('kpi','manage'))
    AND (status <> 'active' OR public.is_admin() OR public.has_perm('kpi','approve')));

DROP POLICY IF EXISTS kpi_plan_items_read ON public.kpi_plan_items;
CREATE POLICY kpi_plan_items_read ON public.kpi_plan_items FOR SELECT TO authenticated USING (
  org_id = public.current_org_id() AND EXISTS (SELECT 1 FROM public.kpi_plans p WHERE p.id = plan_id));
DROP POLICY IF EXISTS kpi_plan_items_write ON public.kpi_plan_items;
CREATE POLICY kpi_plan_items_write ON public.kpi_plan_items FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('kpi','manage')))
  WITH CHECK (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('kpi','manage')));

-- Assignments: the employee sees their own; others by kpi view scope.
-- Writes by kpi managers within their scope, never on themselves (unless
-- admin); making one active needs approve.
DROP POLICY IF EXISTS kpi_assignments_read ON public.kpi_assignments;
CREATE POLICY kpi_assignments_read ON public.kpi_assignments FOR SELECT TO authenticated USING (
  org_id = public.current_org_id() AND (employee_id = auth.uid() OR public.is_admin() OR public.can_reach('kpi','view',employee_id)));
DROP POLICY IF EXISTS kpi_assignments_write ON public.kpi_assignments;
CREATE POLICY kpi_assignments_write ON public.kpi_assignments FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin()
    OR (employee_id <> auth.uid() AND public.can_reach('kpi','manage',employee_id))))
  WITH CHECK (org_id = public.current_org_id() AND (public.is_admin()
    OR (employee_id <> auth.uid() AND public.can_reach('kpi','manage',employee_id)
        AND (status <> 'active' OR public.has_perm('kpi','approve')))));

-- Evaluations and manual values: same reach rules; nobody evaluates
-- themselves (admins excepted).
DROP POLICY IF EXISTS kpi_evaluations_read ON public.kpi_evaluations;
CREATE POLICY kpi_evaluations_read ON public.kpi_evaluations FOR SELECT TO authenticated USING (
  org_id = public.current_org_id() AND (employee_id = auth.uid() OR public.is_admin() OR public.can_reach('kpi','view',employee_id)));
DROP POLICY IF EXISTS kpi_evaluations_write ON public.kpi_evaluations;
CREATE POLICY kpi_evaluations_write ON public.kpi_evaluations FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin()
    OR (employee_id <> auth.uid() AND public.can_reach('kpi','manage',employee_id))))
  WITH CHECK (org_id = public.current_org_id() AND (public.is_admin()
    OR (employee_id <> auth.uid() AND public.can_reach('kpi','manage',employee_id)
        AND (status <> 'finalised' OR public.has_perm('kpi','approve')))));

DROP POLICY IF EXISTS kpi_manual_values_read ON public.kpi_manual_values;
CREATE POLICY kpi_manual_values_read ON public.kpi_manual_values FOR SELECT TO authenticated USING (
  org_id = public.current_org_id() AND (employee_id = auth.uid() OR public.is_admin() OR public.can_reach('kpi','view',employee_id)));
DROP POLICY IF EXISTS kpi_manual_values_write ON public.kpi_manual_values;
CREATE POLICY kpi_manual_values_write ON public.kpi_manual_values FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin()
    OR (employee_id <> auth.uid() AND public.can_reach('kpi','manage',employee_id))))
  WITH CHECK (org_id = public.current_org_id() AND (public.is_admin()
    OR (employee_id <> auth.uid() AND public.can_reach('kpi','manage',employee_id))));

-- ── Platform owner: global library ─────────────────────────────────────────
-- Create (p_id NULL) or edit a global DRAFT template and replace its items.
-- Published/archived versions are never edited: copy to a new version first.
CREATE OR REPLACE FUNCTION public.platform_kpi_save_template(p_id uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE tid uuid := p_id; st text; it jsonb; i int := 0;
BEGIN
  PERFORM public.platform_require_owner();
  IF tid IS NULL THEN
    INSERT INTO kpi_templates (org_id, name, collection, description, department_hint, designation_hints, industry, period, visibility)
    VALUES (NULL, p->>'name', coalesce(p->>'collection',''), coalesce(p->>'description',''), p->>'department_hint',
            coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'designation_hints')), '{}'), p->>'industry',
            coalesce(p->>'period','monthly'), coalesce(p->>'visibility','public'))
    RETURNING id INTO tid;
  ELSE
    SELECT status INTO st FROM kpi_templates WHERE id = tid AND org_id IS NULL FOR UPDATE;
    IF st IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
    IF st <> 'draft' THEN RAISE EXCEPTION 'Only drafts can be edited; create a new version'; END IF;
    UPDATE kpi_templates SET name = p->>'name', collection = coalesce(p->>'collection',''), description = coalesce(p->>'description',''),
      department_hint = p->>'department_hint', designation_hints = coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'designation_hints')), '{}'),
      industry = p->>'industry', period = coalesce(p->>'period','monthly'), visibility = coalesce(p->>'visibility','public')
    WHERE id = tid;
    DELETE FROM kpi_template_items WHERE template_id = tid;
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) LOOP
    i := i + 1;
    INSERT INTO kpi_template_items (template_id, name, description, source_key, measurement, direction, unit,
      default_target, weight, cap, threshold, missing_rule, sort_order)
    VALUES (tid, it->>'name', coalesce(it->>'description',''), nullif(it->>'source_key',''), it->>'measurement',
      coalesce(it->>'direction','higher'), coalesce(it->>'unit',''), (it->>'default_target')::numeric,
      coalesce((it->>'weight')::numeric, 0), (it->>'cap')::numeric, (it->>'threshold')::numeric,
      coalesce(it->>'missing_rule','exclude'), i);
  END LOOP;
  PERFORM public.platform_audit(CASE WHEN p_id IS NULL THEN 'kpi_template_create' ELSE 'kpi_template_update' END,
    'kpi_template', tid::text, jsonb_build_object('name', p->>'name', 'items', i));
  RETURN tid;
END $$;

-- Publish needs weights totalling 100. Unpublish = back to draft is only
-- allowed for a version no organisation has adopted.
CREATE OR REPLACE FUNCTION public.platform_kpi_set_status(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w numeric;
BEGIN
  PERFORM public.platform_require_owner();
  IF p_status NOT IN ('draft','published','archived') THEN RAISE EXCEPTION 'Bad status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM kpi_templates WHERE id = p_id AND org_id IS NULL) THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF p_status = 'published' THEN
    SELECT coalesce(sum(weight), 0) INTO w FROM kpi_template_items WHERE template_id = p_id;
    IF abs(w - 100) > 0.01 THEN RAISE EXCEPTION 'Weights total %, must be 100', w; END IF;
  END IF;
  IF p_status = 'draft' AND EXISTS (SELECT 1 FROM kpi_templates WHERE source_template_id = p_id) THEN
    RAISE EXCEPTION 'Adopted by an organisation; publish a new version instead';
  END IF;
  UPDATE kpi_templates SET status = p_status WHERE id = p_id;
  PERFORM public.platform_audit('kpi_template_' || p_status, 'kpi_template', p_id::text, '{}'::jsonb);
END $$;

-- Copy a global template: as the next version of the same family
-- (p_new_version) or as a new family (duplicate). The copy is a draft.
CREATE OR REPLACE FUNCTION public.platform_kpi_copy(p_id uuid, p_new_version boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE src kpi_templates%ROWTYPE; nid uuid; nver int;
BEGIN
  PERFORM public.platform_require_owner();
  SELECT * INTO src FROM kpi_templates WHERE id = p_id AND org_id IS NULL;
  IF src.id IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF p_new_version THEN
    SELECT max(version) + 1 INTO nver FROM kpi_templates WHERE org_id IS NULL AND family_id = src.family_id;
  END IF;
  INSERT INTO kpi_templates (org_id, family_id, version, name, collection, description, department_hint, designation_hints, industry, period, visibility)
  VALUES (NULL, CASE WHEN p_new_version THEN src.family_id ELSE gen_random_uuid() END, coalesce(nver, 1),
          CASE WHEN p_new_version THEN src.name ELSE src.name || ' (copy)' END,
          src.collection, src.description, src.department_hint, src.designation_hints, src.industry, src.period, src.visibility)
  RETURNING id INTO nid;
  INSERT INTO kpi_template_items (template_id, name, description, source_key, measurement, direction, unit, default_target, weight, cap, threshold, missing_rule, sort_order)
  SELECT nid, name, description, source_key, measurement, direction, unit, default_target, weight, cap, threshold, missing_rule, sort_order
    FROM kpi_template_items WHERE template_id = p_id;
  PERFORM public.platform_audit(CASE WHEN p_new_version THEN 'kpi_template_version' ELSE 'kpi_template_duplicate' END,
    'kpi_template', nid::text, jsonb_build_object('from', p_id));
  RETURN nid;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_kpi_save_template(uuid, jsonb), public.platform_kpi_set_status(uuid, text),
  public.platform_kpi_copy(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_kpi_save_template(uuid, jsonb), public.platform_kpi_set_status(uuid, text),
  public.platform_kpi_copy(uuid, boolean) TO authenticated;

-- ── Seed: 18 global collections ────────────────────────────────────────────
-- item = [name, source_key (null = manual), measurement, direction, unit, weight]
-- Source keys exist in src/lib/kpi/sources.ts; 'support.first_response_hours'
-- has no source yet and shows "Data source not configured".
DO $$
DECLARE c jsonb; it jsonb; tid uuid; n int := 0; i int;
BEGIN
  IF EXISTS (SELECT 1 FROM kpi_templates WHERE org_id IS NULL) THEN RETURN; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements($j$[
   {"n":"Sales & Business Development","d":"Sales & Business Development","h":["Sales Executive","Sales Manager","Business Development Executive","Business Development Manager","Account Executive"],"i":[
     ["Leads added","sales.leads_added","numeric","higher","leads",15],["Lead conversion rate","sales.lead_conversion","percentage","higher","%",20],
     ["Deals closed (won)","sales.deals_won","numeric","higher","deals",20],["Revenue won","sales.revenue_won","currency","higher","₹",30],
     ["Quotes created","sales.quotes_sent","numeric","higher","quotes",15]]},
   {"n":"Calling & Telecalling","d":"Customer Support","h":["Call Center Executive","Customer Service Representative"],"i":[
     ["Total calls","calls.total","numeric","higher","calls",25],["Calls with talk time","calls.talked","numeric","higher","calls",20],
     ["Talk time","calls.talk_minutes","time","higher","min",15],["Call task done rate","calltasks.done_rate","percentage","higher","%",25],
     ["Follow-ups scheduled","calls.followups","numeric","higher","follow-ups",15]]},
   {"n":"Web Development","d":"Software Engineering","h":["Website Developer","Shopify Developer","WordPress Developer","Frontend Developer","Full Stack Developer"],"i":[
     ["Tasks completed","work.tasks_completed","numeric","higher","tasks",30],["On-time delivery","work.on_time","percentage","higher","%",30],
     ["Hours logged","work.hours_logged","time","higher","h",15],["Overdue open tasks","work.overdue_open","numeric","lower","tasks",10],
     ["Code quality review",null,"rating","higher","/5",15]]},
   {"n":"Software Engineering","d":"Software Engineering","h":["Software Engineer","Senior Software Engineer","Backend Developer","React Developer","Next.js Developer","Mobile App Developer","DevOps Engineer"],"i":[
     ["Tasks completed","work.tasks_completed","numeric","higher","tasks",25],["On-time delivery","work.on_time","percentage","higher","%",25],
     ["Bugs resolved",null,"numeric","higher","bugs",20],["Code review quality",null,"rating","higher","/5",15],
     ["Hours logged","work.hours_logged","time","higher","h",15]]},
   {"n":"UI/UX Design","d":"UI/UX & Creative Design","h":["UI Designer","UX Designer","UI/UX Designer"],"i":[
     ["Design tasks completed","work.tasks_completed","numeric","higher","tasks",30],["On-time delivery","work.on_time","percentage","higher","%",25],
     ["Design review rating",null,"rating","higher","/5",25],["Hours logged","work.hours_logged","time","higher","h",20]]},
   {"n":"Graphic Design","d":"Creative & Content","h":["Graphic Designer","Motion Graphics Designer","Video Editor","Animator"],"i":[
     ["Creatives delivered","work.tasks_completed","numeric","higher","tasks",35],["On-time delivery","work.on_time","percentage","higher","%",30],
     ["Revision rounds per creative",null,"numeric","lower","rounds",15],["Quality rating",null,"rating","higher","/5",20]]},
   {"n":"Digital Marketing","d":"Marketing & Growth","h":["Digital Marketing Executive","Performance Marketing Executive","Marketing Manager","Growth Manager"],"i":[
     ["Campaign tasks completed","work.tasks_completed","numeric","higher","tasks",25],["On-time delivery","work.on_time","percentage","higher","%",20],
     ["Leads generated",null,"numeric","higher","leads",25],["Cost per lead",null,"currency","lower","₹",15],["Return on ad spend",null,"numeric","higher","x",15]]},
   {"n":"SEO","d":"Marketing & Growth","h":["SEO Executive","SEM Specialist"],"i":[
     ["SEO tasks completed","work.tasks_completed","numeric","higher","tasks",20],["Organic traffic growth",null,"percentage","higher","%",30],
     ["Keywords in top 10",null,"numeric","higher","keywords",25],["Quality backlinks earned",null,"numeric","higher","links",10],
     ["On-time delivery","work.on_time","percentage","higher","%",15]]},
   {"n":"Social Media Management","d":"Marketing & Growth","h":["Social Media Manager","Social Media Executive"],"i":[
     ["Posts published",null,"numeric","higher","posts",25],["Engagement rate",null,"percentage","higher","%",30],
     ["Follower growth",null,"percentage","higher","%",20],["On-time delivery","work.on_time","percentage","higher","%",25]]},
   {"n":"Customer Support","d":"Customer Support","h":["Customer Support Executive","Customer Support Manager","Customer Success Executive"],"i":[
     ["Tickets resolved","support.tickets_resolved","numeric","higher","tickets",25],["Average resolution time","support.resolution_hours","time","lower","h",20],
     ["SLA achievement","support.sla_met","percentage","higher","%",25],["Customer satisfaction (CSAT)",null,"rating","higher","/5",20],
     ["First response time","support.first_response_hours","time","lower","h",10]]},
   {"n":"Human Resources","d":"Human Resources (HR)","h":["HR Manager","HR Executive","HR Generalist","HR Business Partner"],"i":[
     ["Hiring closed on time",null,"percentage","higher","%",25],["Employee retention",null,"percentage","higher","%",25],
     ["Training hours delivered",null,"time","higher","h",20],["HR query resolution time",null,"time","lower","h",15],
     ["Policy compliance",null,"boolean","higher","",15]]},
   {"n":"Recruitment","d":"Human Resources (HR)","h":["Recruiter","Recruitment Executive","Talent Acquisition Manager"],"i":[
     ["Positions filled",null,"numeric","higher","hires",30],["Time to hire",null,"time","lower","days",25],
     ["Offer acceptance rate",null,"percentage","higher","%",20],["Candidates screened",null,"numeric","higher","candidates",15],
     ["Hiring manager rating",null,"rating","higher","/5",10]]},
   {"n":"Accounts & Finance","d":"Finance & Accounting","h":["Accountant","Senior Accountant","Accounts Executive","Accounts Receivable Executive","Finance Manager"],"i":[
     ["Invoices processed","finance.invoices_raised","numeric","higher","invoices",25],["Payments received","finance.payments_received","currency","higher","₹",25],
     ["Outstanding receivables","finance.outstanding","currency","lower","₹",20],["Reconciliation completed on time",null,"boolean","higher","",15],
     ["Reporting accuracy",null,"rating","higher","/5",15]]},
   {"n":"Administration","d":"Administration & Facilities","h":["Administrative Assistant","Office Assistant","Receptionist","Coordinator"],"i":[
     ["Admin tasks completed","work.tasks_completed","numeric","higher","tasks",30],["On-time delivery","work.on_time","percentage","higher","%",25],
     ["Facility and vendor issues resolved",null,"numeric","higher","issues",25],["Days present","attendance.days_present","numeric","higher","days",20]]},
   {"n":"Operations","d":"Operations","h":["Operations Executive","Operations Manager","Operations Supervisor","Operations Analyst"],"i":[
     ["Tasks completed","work.tasks_completed","numeric","higher","tasks",25],["On-time delivery","work.on_time","percentage","higher","%",25],
     ["Overdue open tasks","work.overdue_open","numeric","lower","tasks",15],["Process improvement milestones",null,"milestone","higher","%",20],
     ["Productive hours","attendance.productive_hours","time","higher","h",15]]},
   {"n":"Project Management","d":"Project & Program Management","h":["Project Manager","Program Manager"],"i":[
     ["Project milestones achieved",null,"milestone","higher","%",30],["On-time delivery","work.on_time","percentage","higher","%",25],
     ["Overdue open tasks","work.overdue_open","numeric","lower","tasks",15],["Stakeholder rating",null,"rating","higher","/5",15],
     ["Hours logged","work.hours_logged","time","higher","h",15]]},
   {"n":"IT & Technical Support","d":"Information Technology (IT)","h":["IT Administrator","System Administrator","Technical Support Engineer"],"i":[
     ["Tickets resolved","support.tickets_resolved","numeric","higher","tickets",30],["Average resolution time","support.resolution_hours","time","lower","h",25],
     ["SLA achievement","support.sla_met","percentage","higher","%",20],["System uptime",null,"percentage","higher","%",15],
     ["User satisfaction",null,"rating","higher","/5",10]]},
   {"n":"Management & Leadership","d":"Executive Management","h":["Manager","Senior Manager","Team Lead","Department Head","General Manager"],"i":[
     ["Team goal achievement",null,"percentage","higher","%",30],["Team retention",null,"percentage","higher","%",20],
     ["Reviews completed on time",null,"boolean","higher","",15],["Strategic milestones",null,"milestone","higher","%",20],
     ["Days present","attendance.days_present","numeric","higher","days",15]]}
  ]$j$::jsonb) LOOP
    n := n + 1;
    INSERT INTO kpi_templates (org_id, name, collection, description, department_hint, designation_hints, status, visibility)
    VALUES (NULL, c->>'n', c->>'n', 'Starter KPI set. Set your own targets before assigning.', c->>'d',
            ARRAY(SELECT jsonb_array_elements_text(c->'h')), 'published', 'public')
    RETURNING id INTO tid;
    i := 0;
    FOR it IN SELECT * FROM jsonb_array_elements(c->'i') LOOP
      i := i + 1;
      INSERT INTO kpi_template_items (template_id, name, source_key, measurement, direction, unit, weight, sort_order)
      VALUES (tid, it->>0, it->>1, it->>2, it->>3, it->>4, (it->>5)::numeric, i);
    END LOOP;
    IF (SELECT sum(weight) FROM kpi_template_items WHERE template_id = tid) <> 100 THEN
      RAISE EXCEPTION 'Seed weights for % do not total 100', c->>'n';
    END IF;
  END LOOP;
  IF n <> 18 THEN RAISE EXCEPTION 'Expected 18 collections, got %', n; END IF;
END $$;

COMMIT;
