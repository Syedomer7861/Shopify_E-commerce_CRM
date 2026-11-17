-- KPI engine, phase 4: plans and assignments.
--
-- kpi_save_plan(id, p)              create/edit a plan and replace its items.
-- kpi_set_plan_status(id, status)   activate (weights 100, targets set; needs
--                                   approve via RLS), back to draft or archive
--                                   (only with no active assignments).
-- kpi_assign(plan, employees, from, activate)
--                                   bulk assign: active (needs approve) or as
--                                   suggestions; an employee's previous active
--                                   assignment is ended, never deleted.
-- kpi_approve_assignment(id, from)  turn a suggestion into the active plan.
-- kpi_suggest_all()                 suggest the best active plan for every
--                                   employee the caller can manage.
-- Trigger on profiles               a new employee, or one whose department or
--                                   designation changes, gets a suggestion. It
--                                   never activates anything, and a failure
--                                   only logs a warning: saving the employee
--                                   always succeeds.
--
-- The user-facing functions are SECURITY INVOKER (RLS decides), except
-- kpi_suggest_all, which checks kpi.manage + can_reach itself. Matching:
-- an active plan for the designation wins over one for the department.
--
-- Additive only. Rollback:
--   DROP TRIGGER IF EXISTS profiles_kpi_suggest ON public.profiles;
--   DROP FUNCTION IF EXISTS public.kpi_profile_suggest(), public.kpi_suggest_all(), public.kpi_suggest_for(uuid, text),
--     public.kpi_best_plan(uuid, uuid, uuid), public.kpi_approve_assignment(uuid, date), public.kpi_close_open(uuid, date, uuid),
--     public.kpi_assign(uuid, uuid[], date, boolean), public.kpi_set_plan_status(uuid, text), public.kpi_save_plan(uuid, jsonb);
--   DROP INDEX IF EXISTS public.kpi_assignments_one_active;

BEGIN;

-- One active assignment per employee.
CREATE UNIQUE INDEX IF NOT EXISTS kpi_assignments_one_active ON public.kpi_assignments (employee_id) WHERE status = 'active';

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
    UPDATE kpi_plans SET name = p->>'name', department_id = (p->>'department_id')::uuid, designation_id = (p->>'designation_id')::uuid,
      period = coalesce(p->>'period','monthly')
    WHERE id = pid AND org_id = org AND status <> 'archived';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RAISE EXCEPTION 'Plan not found, archived or not allowed' USING ERRCODE = '42501'; END IF;
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

CREATE OR REPLACE FUNCTION public.kpi_set_plan_status(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE w numeric; missing int; n int;
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
END $$;

-- End whatever the employee has open before a new assignment starts.
-- Runs inside the invoker functions below, so RLS applies to these updates too.
CREATE OR REPLACE FUNCTION public.kpi_close_open(p_emp uuid, p_from date, p_keep uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
  UPDATE kpi_assignments SET status = 'ended', effective_to = greatest(effective_from, p_from - 1),
    reason = CASE WHEN status = 'suggested' THEN 'Superseded' ELSE reason END
  WHERE employee_id = p_emp AND status IN ('active','suggested') AND id IS DISTINCT FROM p_keep;
$$;

CREATE OR REPLACE FUNCTION public.kpi_assign(p_plan uuid, p_employees uuid[], p_from date, p_activate boolean)
RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE e uuid; n int := 0; org uuid := public.current_org_id();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM kpi_plans WHERE id = p_plan AND org_id = org AND status = 'active') THEN
    RAISE EXCEPTION 'Only active plans can be assigned';
  END IF;
  FOREACH e IN ARRAY coalesce(p_employees, '{}') LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM kpi_assignments WHERE employee_id = e AND plan_id = p_plan AND status = 'active');
    IF p_activate THEN
      PERFORM public.kpi_close_open(e, coalesce(p_from, current_date), NULL);
      INSERT INTO kpi_assignments (org_id, plan_id, employee_id, effective_from, status, reason, approved_by)
      VALUES (org, p_plan, e, coalesce(p_from, current_date), 'active', 'Assigned', auth.uid());
    ELSE
      UPDATE kpi_assignments SET status = 'ended', effective_to = greatest(effective_from, current_date), reason = 'Superseded'
       WHERE employee_id = e AND status = 'suggested';
      INSERT INTO kpi_assignments (org_id, plan_id, employee_id, effective_from, status, reason)
      VALUES (org, p_plan, e, coalesce(p_from, current_date), 'suggested', 'Bulk assignment, waiting for approval');
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.kpi_approve_assignment(p_id uuid, p_from date)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE a kpi_assignments%ROWTYPE; d date := coalesce(p_from, current_date); n int;
BEGIN
  SELECT * INTO a FROM kpi_assignments WHERE id = p_id AND status = 'suggested';
  IF a.id IS NULL THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM kpi_plans WHERE id = a.plan_id AND status = 'active') THEN
    RAISE EXCEPTION 'The plan is not active';
  END IF;
  PERFORM public.kpi_close_open(a.employee_id, d, a.id);
  -- RLS filters rows silently; zero rows means the caller may not approve this one.
  UPDATE kpi_assignments SET status = 'active', effective_from = d, approved_by = auth.uid() WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Not allowed to approve this assignment' USING ERRCODE = '42501'; END IF;
END $$;

-- Best active plan for a placement: designation match first, then department.
CREATE OR REPLACE FUNCTION public.kpi_best_plan(p_org uuid, p_dept uuid, p_desig uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM kpi_plans
   WHERE org_id = p_org AND status = 'active'
     AND ((p_desig IS NOT NULL AND designation_id = p_desig AND (department_id IS NULL OR department_id IS NOT DISTINCT FROM p_dept))
       OR (p_dept IS NOT NULL AND designation_id IS NULL AND department_id = p_dept))
   ORDER BY (designation_id IS NOT NULL) DESC, (department_id IS NOT NULL) DESC, approved_at DESC NULLS LAST
   LIMIT 1;
$$;

-- Internal: add a suggestion for one employee when a better plan exists.
CREATE OR REPLACE FUNCTION public.kpi_suggest_for(p_emp uuid, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pr profiles%ROWTYPE; plan uuid;
BEGIN
  SELECT * INTO pr FROM profiles WHERE id = p_emp;
  IF pr.id IS NULL OR NOT coalesce(pr.is_active, true) OR pr.org_id IS NULL THEN RETURN false; END IF;
  plan := public.kpi_best_plan(pr.org_id, pr.department_id, pr.designation_id);
  IF plan IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM kpi_assignments WHERE employee_id = p_emp AND plan_id = plan AND status IN ('active','suggested')) THEN RETURN false; END IF;
  UPDATE kpi_assignments SET status = 'ended', effective_to = greatest(effective_from, current_date), reason = 'Superseded'
   WHERE employee_id = p_emp AND status = 'suggested';
  INSERT INTO kpi_assignments (org_id, plan_id, employee_id, effective_from, status, reason)
  VALUES (pr.org_id, plan, p_emp, current_date, 'suggested', p_reason);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.kpi_suggest_all()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; n int := 0;
BEGIN
  IF NOT (public.is_admin() OR public.has_perm('kpi','manage')) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  FOR r IN SELECT id FROM profiles WHERE org_id = public.current_org_id() AND coalesce(is_active, true)
             AND (public.is_admin() OR public.can_reach('kpi','manage', id)) LOOP
    IF public.kpi_suggest_for(r.id, 'Matches department or designation') THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.kpi_profile_suggest()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  BEGIN
    PERFORM public.kpi_suggest_for(NEW.id, CASE WHEN TG_OP = 'INSERT' THEN 'New employee' ELSE 'Moved to a new department or designation' END);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'kpi_profile_suggest failed: %', SQLERRM;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS profiles_kpi_suggest ON public.profiles;
CREATE TRIGGER profiles_kpi_suggest AFTER INSERT OR UPDATE OF department_id, designation_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.kpi_profile_suggest();

REVOKE EXECUTE ON FUNCTION public.kpi_best_plan(uuid, uuid, uuid), public.kpi_suggest_for(uuid, text), public.kpi_profile_suggest()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kpi_save_plan(uuid, jsonb), public.kpi_set_plan_status(uuid, text), public.kpi_close_open(uuid, date, uuid),
  public.kpi_assign(uuid, uuid[], date, boolean), public.kpi_approve_assignment(uuid, date), public.kpi_suggest_all() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_save_plan(uuid, jsonb), public.kpi_set_plan_status(uuid, text), public.kpi_close_open(uuid, date, uuid),
  public.kpi_assign(uuid, uuid[], date, boolean), public.kpi_approve_assignment(uuid, date), public.kpi_suggest_all() TO authenticated;

COMMIT;
