-- Phase 1b, batch 5: org-scope RLS on chat (channels, channel_members,
-- messages). Policies reproduced exactly as traced through
-- 20240424000000_chat_system.sql (base), 20260501_chat_deletion_hardening.sql,
-- 20260501_chat_member_discovery_fix.sql — confirmed nothing later redefines
-- any of them.
--
-- message_receipts is NOT touched: it has RLS enabled but has never had a
-- single policy defined on it (checked — zero CREATE POLICY ... ON
-- message_receipts anywhere in the migration history), so with RLS on and
-- no permissive policy it's already fully locked to the authenticated role.
-- Pre-existing condition, not something this migration should invent
-- semantics for.

ALTER TABLE channels        ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE channel_members ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE messages        ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE message_receipts ALTER COLUMN org_id SET DEFAULT public.current_org_id();

-- channels
DROP POLICY IF EXISTS "admin_manager_all_channels" ON channels;
CREATE POLICY "admin_manager_all_channels" ON channels FOR ALL TO authenticated
  USING ((public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager')
    AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "members_delete_channels" ON channels;
CREATE POLICY "members_delete_channels" ON channels FOR DELETE TO authenticated
  USING (id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
    AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "users_see_own_channels" ON channels;
CREATE POLICY "users_see_own_channels" ON channels FOR SELECT TO authenticated
  USING (
    (id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
      OR public.is_admin()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager')
    AND org_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "Authenticated users can create channels" ON channels;
CREATE POLICY "Authenticated users can create channels" ON channels FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

-- channel_members
DROP POLICY IF EXISTS "users_see_channel_members" ON channel_members;
CREATE POLICY "users_see_channel_members" ON channel_members FOR SELECT TO authenticated
  USING (
    (channel_id IN (SELECT cm.channel_id FROM channel_members cm WHERE cm.user_id = auth.uid())
      OR public.is_admin())
    AND org_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "admin_manager_all_members" ON channel_members;
CREATE POLICY "admin_manager_all_members" ON channel_members FOR ALL TO authenticated
  USING ((public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager')
    AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "Users can join channels" ON channel_members;
CREATE POLICY "Users can join channels" ON channel_members FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

-- messages
DROP POLICY IF EXISTS "messages_view_members" ON messages;
CREATE POLICY "messages_view_members" ON messages FOR SELECT TO authenticated
  USING (
    (EXISTS (SELECT 1 FROM channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid())
      OR public.is_admin())
    AND org_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "messages_send_members" ON messages;
CREATE POLICY "messages_send_members" ON messages FOR INSERT TO authenticated
  WITH CHECK (
    (EXISTS (SELECT 1 FROM channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid())
      OR public.is_admin())
    AND org_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "admin_manager_all_messages" ON messages;
CREATE POLICY "admin_manager_all_messages" ON messages FOR ALL TO authenticated
  USING ((public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager')
    AND org_id = public.current_org_id());
