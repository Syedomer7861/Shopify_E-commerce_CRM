-- Phase 1b, batch 3: org-scope RLS on profiles itself. Highest-touch table
-- (login, self-lookup, team directory) so done alone, not bundled with HR.
-- All 5 current policies traced and confirmed unchanged since their last
-- edit: profiles_self_update (20260413_phase4_ecosystem.sql),
-- profiles_read_public / admin_manage_all_profiles (20260427_rls_hardening.sql),
-- hr_manage_employee_profiles (20260826c_fix_profile_self_escalation.sql),
-- hr_delete_employee_profiles (20260826l_lock_down_hr_tables.sql).
--
-- Safe against the recursion is_admin()/has_role()/current_org_id() were
-- built to avoid: all three are SECURITY DEFINER, so they bypass profiles'
-- own RLS when reading it internally — adding org_id checks to profiles'
-- policies doesn't create a new cycle.
--
-- No INSERT policy exists on profiles (none needed): new rows come from the
-- handle_new_user trigger and admin.ts's service-role upsert, both of which
-- bypass RLS entirely. Unaffected by this migration.

ALTER TABLE profiles ALTER COLUMN org_id SET DEFAULT public.current_org_id();

DROP POLICY IF EXISTS "profiles_read_public" ON profiles;
CREATE POLICY "profiles_read_public" ON profiles FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "admin_manage_all_profiles" ON profiles;
CREATE POLICY "admin_manage_all_profiles" ON profiles FOR ALL TO authenticated
  USING (public.is_admin() AND org_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "profiles_self_update" ON profiles;
CREATE POLICY "profiles_self_update" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id AND org_id = public.current_org_id())
  WITH CHECK (auth.uid() = id AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "hr_manage_employee_profiles" ON profiles;
CREATE POLICY "hr_manage_employee_profiles" ON profiles FOR UPDATE TO authenticated
  USING (public.has_role('hr') AND role <> 'admin' AND org_id = public.current_org_id())
  WITH CHECK (public.has_role('hr') AND role <> 'admin' AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "hr_delete_employee_profiles" ON profiles;
CREATE POLICY "hr_delete_employee_profiles" ON profiles FOR DELETE TO authenticated
  USING (public.has_role('hr') AND role <> 'admin' AND org_id = public.current_org_id());
