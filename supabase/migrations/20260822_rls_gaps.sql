-- ============================================================
-- RLS gap closure: campaigns, campaign_templates, lead_scores
-- plus HR tables that were readable by every authenticated user.
-- ============================================================

-- is_admin() is referenced by existing policies but was never defined in a
-- migration. Define it idempotently so a fresh database matches production.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(target text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = target
  );
$$;

-- 1. Tables that had no RLS at all: reachable with the public anon key.
ALTER TABLE campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scores        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_campaigns" ON campaigns;
CREATE POLICY "auth_all_campaigns" ON campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_campaign_templates" ON campaign_templates;
CREATE POLICY "auth_all_campaign_templates" ON campaign_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_lead_scores" ON lead_scores;
CREATE POLICY "auth_all_lead_scores" ON lead_scores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. HR tables: previously "FOR ALL TO authenticated USING (true)", so any
--    agent could read and edit every salary revision, expense and review.
DROP POLICY IF EXISTS "auth_all_salary_revisions" ON salary_revisions;
CREATE POLICY "hr_admin_manage_salary" ON salary_revisions
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr'))
  WITH CHECK (public.is_admin() OR public.has_role('hr'));
CREATE POLICY "employee_read_own_salary" ON salary_revisions
  FOR SELECT TO authenticated USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "auth_all_performance_reviews" ON performance_reviews;
CREATE POLICY "hr_admin_manage_reviews" ON performance_reviews
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr') OR public.has_role('manager'))
  WITH CHECK (public.is_admin() OR public.has_role('hr') OR public.has_role('manager'));
CREATE POLICY "employee_read_own_reviews" ON performance_reviews
  FOR SELECT TO authenticated USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "auth_all_expenses" ON expenses;
CREATE POLICY "hr_admin_manage_expenses" ON expenses
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr'))
  WITH CHECK (public.is_admin() OR public.has_role('hr'));
CREATE POLICY "employee_own_expenses" ON expenses
  FOR SELECT TO authenticated USING (agent_id = auth.uid());
CREATE POLICY "employee_create_own_expenses" ON expenses
  FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());

-- Grievances are complaints; every agent could read and edit all of them.
DROP POLICY IF EXISTS "auth_all_grievances" ON grievances;
CREATE POLICY "hr_admin_manage_grievances" ON grievances
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr'))
  WITH CHECK (public.is_admin() OR public.has_role('hr'));
CREATE POLICY "employee_own_grievances" ON grievances
  FOR SELECT TO authenticated USING (agent_id = auth.uid());
CREATE POLICY "employee_file_own_grievances" ON grievances
  FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());
