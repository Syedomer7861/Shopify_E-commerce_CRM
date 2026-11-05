-- Phase 1b, batch 2: org-scope RLS on HR tables. Policies reproduced exactly
-- as traced through 20260826e_harden_abandoned_carts_rls.sql (agent_attendance,
-- leaves, agent_activity_logs, announcements), 20260826l_lock_down_hr_tables.sql
-- (salary_revisions, expenses, performance_reviews, training_assignments,
-- grievances, payroll_runs, attendance_log, hr_policies — the single
-- admin-or-hr pattern), and 20260824b_attendance_shifts_holidays.sql
-- (holidays, still the original unrestricted blanket policy).
--
-- `profiles` itself is NOT touched here — its own org-scoping affects
-- login/self-lookup on every page and deserves its own small, carefully
-- tested batch rather than riding along with HR.

ALTER TABLE agent_attendance      ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE leaves                ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE agent_activity_logs   ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE announcements         ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE salary_revisions      ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE expenses              ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE performance_reviews   ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE training_assignments  ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE grievances            ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE payroll_runs          ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE attendance_log        ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE hr_policies           ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE holidays              ALTER COLUMN org_id SET DEFAULT public.current_org_id();

-- agent_attendance
DROP POLICY IF EXISTS "admin_hr_all_attendance" ON agent_attendance;
CREATE POLICY "admin_hr_all_attendance" ON agent_attendance FOR SELECT TO authenticated
  USING ((public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'hr')
    AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_own_attendance" ON agent_attendance;
CREATE POLICY "agent_own_attendance" ON agent_attendance FOR SELECT TO authenticated
  USING (agent_id = auth.uid() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_create_own_attendance" ON agent_attendance;
CREATE POLICY "agent_create_own_attendance" ON agent_attendance FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() AND org_id = public.current_org_id());

-- leaves
DROP POLICY IF EXISTS "admin_hr_all_leaves" ON leaves;
CREATE POLICY "admin_hr_all_leaves" ON leaves FOR ALL TO authenticated
  USING ((public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'hr')
    AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_own_leaves" ON leaves;
CREATE POLICY "agent_own_leaves" ON leaves FOR SELECT TO authenticated
  USING (agent_id = auth.uid() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_create_own_leaves" ON leaves;
CREATE POLICY "agent_create_own_leaves" ON leaves FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() AND org_id = public.current_org_id());

-- agent_activity_logs
DROP POLICY IF EXISTS "admin_manager_all_activity" ON agent_activity_logs;
CREATE POLICY "admin_manager_all_activity" ON agent_activity_logs FOR SELECT TO authenticated
  USING ((public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager')
    AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_own_activity" ON agent_activity_logs;
CREATE POLICY "agent_own_activity" ON agent_activity_logs FOR SELECT TO authenticated
  USING (agent_id = auth.uid() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_create_own_activity" ON agent_activity_logs;
CREATE POLICY "agent_create_own_activity" ON agent_activity_logs FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() AND org_id = public.current_org_id());

-- announcements
DROP POLICY IF EXISTS "admin_hr_manage_announcements" ON announcements;
CREATE POLICY "admin_hr_manage_announcements" ON announcements FOR ALL TO authenticated
  USING ((public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'hr')
    AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "all_read_announcements" ON announcements;
CREATE POLICY "all_read_announcements" ON announcements FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

-- admin-or-hr, FOR ALL, identical shape across these 8 tables
DROP POLICY IF EXISTS "admin_hr_salary_revisions" ON salary_revisions;
CREATE POLICY "admin_hr_salary_revisions" ON salary_revisions FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "admin_hr_expenses" ON expenses;
CREATE POLICY "admin_hr_expenses" ON expenses FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "admin_hr_performance_reviews" ON performance_reviews;
CREATE POLICY "admin_hr_performance_reviews" ON performance_reviews FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "admin_hr_training_assignments" ON training_assignments;
CREATE POLICY "admin_hr_training_assignments" ON training_assignments FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "admin_hr_grievances" ON grievances;
CREATE POLICY "admin_hr_grievances" ON grievances FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "admin_hr_payroll_runs" ON payroll_runs;
CREATE POLICY "admin_hr_payroll_runs" ON payroll_runs FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "admin_hr_attendance_log" ON attendance_log;
CREATE POLICY "admin_hr_attendance_log" ON attendance_log FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "admin_hr_hr_policies" ON hr_policies;
CREATE POLICY "admin_hr_hr_policies" ON hr_policies FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id());

-- holidays (still the original unrestricted blanket policy — just add the org boundary)
DROP POLICY IF EXISTS "auth_all_holidays" ON holidays;
CREATE POLICY "auth_all_holidays" ON holidays FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());
