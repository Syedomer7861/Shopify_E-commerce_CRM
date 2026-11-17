-- KPI engine, phase 7: plan versions and history protection.
--
-- Problem fixed: kpi_save_plan rewrote an in-use plan's items in place.
-- That deleted kpi_plan_items, which cascaded to kpi_manual_values (entered
-- values lost) and silently changed live scores mid-period.
--
-- Now:
--   * A plan's items can only be rewritten while it is a draft that has never
--     been assigned. In-use plans change through a new version.
--   * kpi_plan_new_version(id) copies a plan (and its items) into a draft
--     with version + 1 and previous_plan_id pointing at the source.
--   * Activating a version moves the previous version's active employees to
--     it from today (old assignments end yesterday, never deleted), repoints
--     waiting suggestions and archives the previous version. If the caller
--     can't reach every active employee, nothing happens.
--   * Manual values are locked once that period's evaluation is finalised.
--   * Deleting a plan item no longer cascades to manual values (RESTRICT).
--
-- Additive only. Rollback:
--   DROP TRIGGER IF EXISTS kpi_manual_values_lock ON public.kpi_manual_values;
--   DROP FUNCTION IF EXISTS public.kpi_manual_value_lock(), public.kpi_plan_new_version(uuid),
--     public.kpi_plan_active_count(uuid);
--   ALTER TABLE public.kpi_manual_values DROP CONSTRAINT kpi_manual_values_plan_item_id_fkey,
--     ADD CONSTRAINT kpi_manual_values_plan_item_id_fkey FOREIGN KEY (plan_item_id)
--     REFERENCES public.kpi_plan_items(id) ON DELETE CASCADE;
--   ALTER TABLE public.kpi_plans DROP COLUMN previous_plan_id, DROP COLUMN version;
--   then re-run kpi_save_plan / kpi_set_plan_status from 20261117f.
BEGIN;

ALTER TABLE public.kpi_plans
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  ADD COLUMN IF NOT EXISTS previous_plan_id uuid REFERENCES public.kpi_plans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS kpi_plans_previous ON public.kpi_plans (previous_plan_id) WHERE previous_plan_id IS NOT NULL;

ALTER TABLE public.kpi_manual_values DROP CONSTRAINT IF EXISTS kpi_manual_values_plan_item_id_fkey;
ALTER TABLE public.kpi_manual_values ADD CONSTRAINT kpi_manual_values_plan_item_id_fkey
  FOREIGN KEY (plan_item_id) REFERENCES public.kpi_plan_items(id) ON DELETE RESTRICT;

-- Same signature as 20261117f; only the edit branch changes.
CREATE OR REPLACE FUNCTION public.kpi_save_plan(p_id uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE pid uuid := coalesce(p_id, gen_random_uuid()); it jsonb; i int := 0; org uuid := public.current_org_id(); n int;
BEGIN
  IF org IS NULL THEN RAISE EXCEPTION 'No organisation' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO kpi_plans (id, org_id, name, template_id, template_version, department_id, designation_id, period, status)
    VALUES (pid, org, p->>'name', (p->>'template_id')::uuid, (p->>'template_version')::int,
            (p->>'department_id')::uuid, (p->>'designation_id')::uuid, coalesce(p->>'period','monthly'), 'draft');
  ELSE
    IF EXISTS (SELECT 1 FROM kpi_plans WHERE id = pid AND status <> 'draft')
       OR EXISTS (SELECT 1 FROM kpi_assignments WHERE plan_id = pid) THEN
      RAISE EXCEPTION 'This plan is in use. Create a new version to change it.';
    END IF;
    UPDATE kpi_plans SET name = p->>'name', department_id = (p->>'department_id')::uuid, designation_id = (p->>'designation_id')::uuid,
      period = coalesce(p->>'period','monthly')
    WHERE id = pid AND org_id = org AND status = 'draft';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RAISE EXCEPTION 'Plan not found or not allowed' USING ERRCODE = '42501'; END IF;
    DELETE FROM kpi_plan_items WHERE plan_id = pid;
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) LOOP
    i := i + 1;
    INSERT INTO kpi_plan_items (plan_id, org_id, name, description, source_key, measurement, direction, unit, target, weight, cap, threshold, missing_rule, sort_order)
    VALUES (pid, org, it->>'name', coalesce(it->>'description',''), nullif(it->>'source_key',''), it->>'measurement',
      coalesce(it->>'direction','higher'), coalesce(it->>'unit',''), (it->>'target')::numeric,
      coalesce((it->>'weight')::numeric, 0), (it->>'cap')::numeric, (it->>'threshold')::numeric,
      coalesce(it->>'missing_rule','exclude'), i);
  END LOOP;
  RETURN pid;
END $$;

-- Copy a plan into the next draft version.
CREATE OR REPLACE FUNCTION public.kpi_plan_new_version(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE src kpi_plans%ROWTYPE; nid uuid := gen_random_uuid(); org uuid := public.current_org_id();
BEGIN
  SELECT * INTO src FROM kpi_plans WHERE id = p_id AND org_id = org;
  IF src.id IS NULL THEN RAISE EXCEPTION 'Plan not found' USING ERRCODE = '42501'; END IF;
  IF src.status = 'draft' AND NOT EXISTS (SELECT 1 FROM kpi_assignments WHERE plan_id = p_id) THEN
    RAISE EXCEPTION 'Drafts can be edited directly';
  END IF;
  IF EXISTS (SELECT 1 FROM kpi_plans WHERE previous_plan_id = p_id AND status = 'draft') THEN
    RAISE EXCEPTION 'A draft of the next version already exists';
  END IF;
  INSERT INTO kpi_plans (id, org_id, name, template_id, template_version, department_id, designation_id, period, status, version, previous_plan_id)
  VALUES (nid, org, src.name, src.template_id, src.template_version, src.department_id, src.designation_id, src.period, 'draft',
          coalesce((SELECT max(version) FROM kpi_plans WHERE org_id = org AND (id = p_id OR previous_plan_id = p_id)), src.version) + 1, p_id);
  INSERT INTO kpi_plan_items (plan_id, org_id, name, description, source_key, measurement, direction, unit, target, weight, cap, threshold, missing_rule, sort_order)
  SELECT nid, org, name, description, source_key, measurement, direction, unit, target, weight, cap, threshold, missing_rule, sort_order
    FROM kpi_plan_items WHERE plan_id = p_id;
  RETURN nid;
END $$;

-- True count of a plan's active assignments in the caller's org, ignoring
-- the caller's reach, so a version switch can refuse to leave anyone behind.
CREATE OR REPLACE FUNCTION public.kpi_plan_active_count(p_plan uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::int FROM kpi_assignments
   WHERE plan_id = p_plan AND status = 'active' AND org_id = public.current_org_id();
$$;

CREATE OR REPLACE FUNCTION public.kpi_set_plan_status(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE w numeric; missing int; n int; prev kpi_plans%ROWTYPE; total int; moved int;
BEGIN
  IF p_status NOT IN ('draft','active','archived') THEN RAISE EXCEPTION 'Bad status'; END IF;
  IF p_status = 'active' THEN
    SELECT coalesce(sum(weight), 0), count(*) FILTER (WHERE measurement <> 'boolean' AND (target IS NULL OR target <= 0))
      INTO w, missing FROM kpi_plan_items WHERE plan_id = p_id;
    IF abs(w - 100) > 0.01 THEN RAISE EXCEPTION 'Weights total %, must be 100', w; END IF;
    IF missing > 0 THEN RAISE EXCEPTION '% KPI(s) have no target', missing; END IF;
  ELSIF EXISTS (SELECT 1 FROM kpi_assignments WHERE plan_id = p_id AND status = 'active') THEN
    RAISE EXCEPTION 'End this plan''s active assignments first';
  END IF;
  UPDATE kpi_plans SET status = p_status,
    approved_by = CASE WHEN p_status = 'active' THEN auth.uid() ELSE approved_by END,
    approved_at = CASE WHEN p_status = 'active' THEN now() ELSE approved_at END
  WHERE id = p_id AND org_id = public.current_org_id();
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Plan not found or not allowed' USING ERRCODE = '42501'; END IF;

  -- Activating a new version takes over from the previous one.
  IF p_status = 'active' THEN
    SELECT p.* INTO prev FROM kpi_plans p JOIN kpi_plans c ON c.previous_plan_id = p.id
     WHERE c.id = p_id AND p.status = 'active';
    IF prev.id IS NOT NULL THEN
      total := public.kpi_plan_active_count(prev.id);
      CREATE TEMP TABLE IF NOT EXISTS _kpi_move (employee_id uuid) ON COMMIT DROP;
      TRUNCATE _kpi_move;
      WITH ended AS (
        UPDATE kpi_assignments SET status = 'ended', effective_to = greatest(effective_from, current_date - 1),
          reason = 'Moved to version ' || (SELECT version FROM kpi_plans WHERE id = p_id)
        WHERE plan_id = prev.id AND status = 'active'
        RETURNING employee_id)
      INSERT INTO _kpi_move SELECT employee_id FROM ended;
      GET DIAGNOSTICS moved = ROW_COUNT;
      IF moved <> total THEN
        RAISE EXCEPTION 'You can only switch versions when you manage everyone on the previous one (% of %)', moved, total
          USING ERRCODE = '42501';
      END IF;
      INSERT INTO kpi_assignments (org_id, plan_id, employee_id, effective_from, status, reason, approved_by)
      SELECT public.current_org_id(), p_id, employee_id, current_date, 'active', 'New plan version', auth.uid() FROM _kpi_move;
      UPDATE kpi_assignments SET plan_id = p_id WHERE plan_id = prev.id AND status = 'suggested';
      UPDATE kpi_plans SET status = 'archived' WHERE id = prev.id;
    END IF;
  END IF;
END $$;

-- Values behind a finalised evaluation are history too.
CREATE OR REPLACE FUNCTION public.kpi_manual_value_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r kpi_manual_values%ROWTYPE := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  IF EXISTS (
    SELECT 1 FROM kpi_evaluations e
      JOIN kpi_assignments a ON a.id = e.assignment_id
      JOIN kpi_plan_items i ON i.plan_id = a.plan_id
     WHERE i.id = r.plan_item_id AND e.employee_id = r.employee_id
       AND e.period_start = r.period_start AND e.period_end = r.period_end AND e.status = 'finalised')
  OR (TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM kpi_evaluations e
      JOIN kpi_assignments a ON a.id = e.assignment_id
      JOIN kpi_plan_items i ON i.plan_id = a.plan_id
     WHERE i.id = OLD.plan_item_id AND e.employee_id = OLD.employee_id
       AND e.period_start = OLD.period_start AND e.period_end = OLD.period_end AND e.status = 'finalised'))
  THEN
    RAISE EXCEPTION 'This period''s evaluation is finalised; its values cannot change' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE EXECUTE ON FUNCTION public.kpi_manual_value_lock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS kpi_manual_values_lock ON public.kpi_manual_values;
CREATE TRIGGER kpi_manual_values_lock BEFORE INSERT OR UPDATE OR DELETE ON public.kpi_manual_values
  FOR EACH ROW EXECUTE FUNCTION public.kpi_manual_value_lock();

REVOKE EXECUTE ON FUNCTION public.kpi_plan_new_version(uuid), public.kpi_plan_active_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_plan_new_version(uuid), public.kpi_plan_active_count(uuid) TO authenticated;

COMMIT;
