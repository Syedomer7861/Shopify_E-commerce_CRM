-- salary_revisions, expenses, performance_reviews, training_assignments,
-- grievances, payroll_runs, attendance_log, and hr_policies were all
-- created with a blanket `USING (true) WITH CHECK (true)` policy - any
-- authenticated user (a plain agent) could read or write salary history,
-- expense claims, performance review text, grievances, and payroll paid
-- status directly via the Supabase client, bypassing the app entirely.
-- These 8 tables have exactly one consumer in the whole codebase
-- (/api/hr/data and /api/hr/policies/upload, both now admin/hr-gated), so
-- locking RLS to admin/hr has zero blast radius on any other feature.

DROP POLICY IF EXISTS "auth_all_salary_revisions" ON salary_revisions;
CREATE POLICY "admin_hr_salary_revisions" ON salary_revisions
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr'))
  WITH CHECK (public.is_admin() OR public.has_role('hr'));

DROP POLICY IF EXISTS "auth_all_expenses" ON expenses;
CREATE POLICY "admin_hr_expenses" ON expenses
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr'))
  WITH CHECK (public.is_admin() OR public.has_role('hr'));

DROP POLICY IF EXISTS "auth_all_performance_reviews" ON performance_reviews;
CREATE POLICY "admin_hr_performance_reviews" ON performance_reviews
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr'))
  WITH CHECK (public.is_admin() OR public.has_role('hr'));

DROP POLICY IF EXISTS "auth_all_training_assignments" ON training_assignments;
CREATE POLICY "admin_hr_training_assignments" ON training_assignments
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr'))
  WITH CHECK (public.is_admin() OR public.has_role('hr'));

DROP POLICY IF EXISTS "auth_all_grievances" ON grievances;
CREATE POLICY "admin_hr_grievances" ON grievances
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr'))
  WITH CHECK (public.is_admin() OR public.has_role('hr'));

DROP POLICY IF EXISTS "auth_all" ON payroll_runs;
CREATE POLICY "admin_hr_payroll_runs" ON payroll_runs
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr'))
  WITH CHECK (public.is_admin() OR public.has_role('hr'));

DROP POLICY IF EXISTS "auth_all_attendance_log" ON attendance_log;
CREATE POLICY "admin_hr_attendance_log" ON attendance_log
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr'))
  WITH CHECK (public.is_admin() OR public.has_role('hr'));

DROP POLICY IF EXISTS "auth_all_hr_policies" ON hr_policies;
CREATE POLICY "admin_hr_hr_policies" ON hr_policies
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role('hr'))
  WITH CHECK (public.is_admin() OR public.has_role('hr'));

-- profiles: admin_manage_all_profiles (FOR ALL) only lets admins delete a
-- row; hr_manage_employee_profiles (20260826c) only covers UPDATE. HR
-- deleting an employee via EmployeeDirectory.tsx -> /api/hr/data therefore
-- silently affected 0 rows (no RLS error) while the UI reported success,
-- same class of bug 20260826c already fixed for UPDATE.
DROP POLICY IF EXISTS "hr_delete_employee_profiles" ON profiles;
CREATE POLICY "hr_delete_employee_profiles" ON profiles
  FOR DELETE TO authenticated
  USING (public.has_role('hr') AND role <> 'admin');
