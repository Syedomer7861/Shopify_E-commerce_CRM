-- ============================================================
-- CureForever CRM — Chat Member Discovery Fix
-- ============================================================

-- Allow users to see who else is in their channels
-- This is critical for deduplicating DMs and showing participant names
DROP POLICY IF EXISTS "users_see_channel_members" ON channel_members;
CREATE POLICY "users_see_channel_members" ON channel_members 
FOR SELECT TO authenticated 
USING (
  channel_id IN (
    SELECT cm.channel_id 
    FROM channel_members cm 
    WHERE cm.user_id = auth.uid()
  ) OR public.is_admin()
);

-- Harden DM creation to prevent duplicates at the database level
-- We use a partial unique index to ensure only one 'direct' channel exists per pair of users
-- Note: This is complex in a many-to-many table, so we rely on the application-level check 
-- being backed by the RLS fix above.

-- Also ensure managers have full access to members for auditing
DROP POLICY IF EXISTS "admin_all_members" ON channel_members;
CREATE POLICY "admin_manager_all_members" ON channel_members 
FOR ALL TO authenticated 
USING (
  public.is_admin() OR 
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager'
);
