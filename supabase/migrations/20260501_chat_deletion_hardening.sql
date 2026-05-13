-- ============================================================
-- CureForever CRM — Chat Deletion Hardening
-- ============================================================

-- 1. Ensure all foreign keys referencing channels have ON DELETE CASCADE
DO $$
BEGIN
    -- messages
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'messages_channel_id_fkey') THEN
        ALTER TABLE messages DROP CONSTRAINT messages_channel_id_fkey;
    END IF;
    ALTER TABLE messages ADD CONSTRAINT messages_channel_id_fkey 
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE;

    -- channel_members
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'channel_members_channel_id_fkey') THEN
        ALTER TABLE channel_members DROP CONSTRAINT channel_members_channel_id_fkey;
    END IF;
    ALTER TABLE channel_members ADD CONSTRAINT channel_members_channel_id_fkey 
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE;
END $$;

-- 2. Update RLS Policies for Channels
-- Allow Admins and Managers full access
DROP POLICY IF EXISTS "admin_all_channels" ON channels;
CREATE POLICY "admin_manager_all_channels" ON channels 
FOR ALL TO authenticated 
USING (
    public.is_admin() OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager'
);

-- Allow Members to DELETE channels they belong to (e.g. for DMs)
DROP POLICY IF EXISTS "members_delete_channels" ON channels;
CREATE POLICY "members_delete_channels" ON channels 
FOR DELETE TO authenticated 
USING (
    id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
);

-- Ensure agents can view channels they are in
DROP POLICY IF EXISTS "Users can see channels they are members of" ON channels;
CREATE POLICY "users_see_own_channels" ON channels 
FOR SELECT TO authenticated 
USING (
    id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid()) OR 
    public.is_admin() OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager'
);

-- 3. Hardening for Messages as well
DROP POLICY IF EXISTS "admin_all_messages" ON messages;
CREATE POLICY "admin_manager_all_messages" ON messages 
FOR ALL TO authenticated 
USING (
    public.is_admin() OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager'
);

-- 4. Audit Log for Deletions (if any other table references channels, we should add it here)
-- (No other known tables reference channels yet)
