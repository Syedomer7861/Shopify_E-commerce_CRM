-- ============================================================
-- CureForever CRM — RLS Hardening & Multi-Agent Security
-- ============================================================

-- 1. Profiles Protection
-- Protect sensitive HR data while allowing public discovery
DROP POLICY IF EXISTS "profiles_read_all" ON profiles;
DROP POLICY IF EXISTS "profiles_read_public" ON profiles;
CREATE POLICY "profiles_read_public" ON profiles 
FOR SELECT TO authenticated 
USING (true); -- Everyone can see basic info

-- Only Admins/HR can see sensitive fields (this is handled in the application layer usually, 
-- but we can restrict UPDATE/DELETE strictly)
DROP POLICY IF EXISTS "profiles_admin_manage" ON profiles;
DROP POLICY IF EXISTS "admin_manage_all_profiles" ON profiles;
CREATE POLICY "admin_manage_all_profiles" ON profiles 
FOR ALL TO authenticated 
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2. Tasks: Strict Ownership
DROP POLICY IF EXISTS "admin_all_tasks" ON tasks;
DROP POLICY IF EXISTS "agent_own_tasks" ON tasks;
DROP POLICY IF EXISTS "agent_update_own_tasks" ON tasks;

CREATE POLICY "admin_all_tasks" ON tasks 
FOR ALL TO authenticated 
USING (public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');

CREATE POLICY "agent_own_tasks" ON tasks 
FOR SELECT TO authenticated 
USING (assigned_to = auth.uid() OR assigned_to IS NULL);

CREATE POLICY "agent_update_own_tasks" ON tasks 
FOR UPDATE TO authenticated 
USING (assigned_to = auth.uid())
WITH CHECK (assigned_to = auth.uid());

-- 3. Agent Attendance: Privacy
ALTER TABLE agent_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_attendance" ON agent_attendance;
DROP POLICY IF EXISTS "admin_hr_all_attendance" ON agent_attendance;
CREATE POLICY "admin_hr_all_attendance" ON agent_attendance 
FOR SELECT TO authenticated 
USING (public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'hr');

DROP POLICY IF EXISTS "agent_own_attendance" ON agent_attendance;
CREATE POLICY "agent_own_attendance" ON agent_attendance 
FOR SELECT TO authenticated 
USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "agent_create_own_attendance" ON agent_attendance;
CREATE POLICY "agent_create_own_attendance" ON agent_attendance 
FOR INSERT TO authenticated 
WITH CHECK (agent_id = auth.uid());

-- 4. Leaves: Privacy
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_leaves" ON leaves;
DROP POLICY IF EXISTS "admin_hr_all_leaves" ON leaves;
CREATE POLICY "admin_hr_all_leaves" ON leaves 
FOR ALL TO authenticated 
USING (public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'hr');

DROP POLICY IF EXISTS "agent_own_leaves" ON leaves;
CREATE POLICY "agent_own_leaves" ON leaves 
FOR SELECT TO authenticated 
USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "agent_create_own_leaves" ON leaves;
CREATE POLICY "agent_create_own_leaves" ON leaves 
FOR INSERT TO authenticated 
WITH CHECK (agent_id = auth.uid());

-- 5. Activity Logs: Privacy
ALTER TABLE agent_activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_activity" ON agent_activity_logs;
DROP POLICY IF EXISTS "admin_manager_all_activity" ON agent_activity_logs;
CREATE POLICY "admin_manager_all_activity" ON agent_activity_logs 
FOR SELECT TO authenticated 
USING (public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');

DROP POLICY IF EXISTS "agent_own_activity" ON agent_activity_logs;
CREATE POLICY "agent_own_activity" ON agent_activity_logs 
FOR SELECT TO authenticated 
USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "agent_create_own_activity" ON agent_activity_logs;
CREATE POLICY "agent_create_own_activity" ON agent_activity_logs 
FOR INSERT TO authenticated 
WITH CHECK (agent_id = auth.uid());

-- 6. Announcements: Admin/HR Manage, All Read
DROP POLICY IF EXISTS "auth_all_announcements" ON announcements;
DROP POLICY IF EXISTS "admin_hr_manage_announcements" ON announcements;
CREATE POLICY "admin_hr_manage_announcements" ON announcements 
FOR ALL TO authenticated 
USING (public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'hr');

DROP POLICY IF EXISTS "all_read_announcements" ON announcements;
CREATE POLICY "all_read_announcements" ON announcements 
FOR SELECT TO authenticated 
USING (true);
