-- SECOND WAVE of the same cross-tenant gap class as 20261105o, found by
-- broadening the audit from "literal USING(true)" to "any policy that
-- never mentions org_id at all". Three distinct problems surfaced:
--
-- 1. orders: 3 more leftover policies ("Allow Staff to View Orders",
--    "Managers and Agents can view all orders", "Staff can view all
--    orders") each grant any admin/manager/agent — from ANY org — full
--    read access, on top of the "auth_all" already dropped. Same root
--    cause, different names, missed by the first audit's literal-true
--    filter since these use a role check instead of bare true.
--
-- 2. channels / channel_members / messages: an entire PARALLEL set of
--    legacy chat policies (8 + 5 + 1, none matching any name this
--    session's chat batch created) coexisting with the correctly
--    org-scoped ones from 20261105g/h. "admin_all_channels",
--    "admin_all_members", "admin_all_messages", "channels_select_all",
--    "channels_view_members", "members_select_all" in particular grant
--    any admin/manager full cross-org visibility into every org's chat.
--    Never tested because this session's chat verification only read the
--    General channel as a real CureForever admin — the same blind spot as
--    the customers/orders leak.
--
-- 3. raw_call_logs: NOT a leftover duplicate — this table was flat-out
--    missed in Phase 1. Its org_id column exists (added in 20261105b) but
--    its 3 original policies were never updated to check it.
--
-- Also two smaller write-path gaps: the can_delete_permission_* DELETE
-- policies (customers/orders) and agent_attendance's extra "auth_insert_own"
-- INSERT policy, none of which check org_id on the write.
--
-- Not touched here (reviewed, not real gaps): mkt_goals/mkt_spaces (their
-- can_access_space()/is_space_owner() calls already check org internally,
-- just not visible as literal "org_id" text); personal_todos/notes/
-- reminders and the "User" table's own-row checks (a single user belongs
-- to exactly one org, so self-ownership can't cross tenants); egress_watch
-- (legitimately platform-wide infra, not tenant data). storage.objects
-- (file uploads, chat-attachments bucket is even PUBLIC-readable) is a
-- separate, deferred concern — different mechanism (storage policies, not
-- table RLS), needs its own pass.

-- ------------------------------------------------------------
-- orders: drop the 3 extra role-based policies.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Allow Staff to View Orders" ON orders;
DROP POLICY IF EXISTS "Managers and Agents can view all orders" ON orders;
DROP POLICY IF EXISTS "Staff can view all orders" ON orders;

-- ------------------------------------------------------------
-- channels: drop all 8 legacy policies, keep only this session's 4.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Allow chat creation" ON channels;
DROP POLICY IF EXISTS "Users can see channels they are members of" ON channels;
DROP POLICY IF EXISTS "View my chats" ON channels;
DROP POLICY IF EXISTS "admin_all_channels" ON channels;
DROP POLICY IF EXISTS "auth_read_own_channels" ON channels;
DROP POLICY IF EXISTS "authenticated_create_channels" ON channels;
DROP POLICY IF EXISTS "channels_select_all" ON channels;
DROP POLICY IF EXISTS "channels_view_members" ON channels;

-- ------------------------------------------------------------
-- channel_members: drop all 5 legacy policies, keep only this session's 4.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Allow joining chats" ON channel_members;
DROP POLICY IF EXISTS "admin_all_members" ON channel_members;
DROP POLICY IF EXISTS "auth_read_own_channel_members" ON channel_members;
DROP POLICY IF EXISTS "authenticated_join_channels" ON channel_members;
DROP POLICY IF EXISTS "members_select_all" ON channel_members;

-- ------------------------------------------------------------
-- messages: drop the 1 legacy policy (mine is admin_manager_all_messages).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "admin_all_messages" ON messages;

-- ------------------------------------------------------------
-- raw_call_logs: actually missed in Phase 1 — org-scope it now.
-- ------------------------------------------------------------
ALTER TABLE raw_call_logs ALTER COLUMN org_id SET DEFAULT public.current_org_id();

DROP POLICY IF EXISTS "admin_manager_all_call_logs" ON raw_call_logs;
CREATE POLICY "admin_manager_all_call_logs" ON raw_call_logs FOR ALL TO authenticated
  USING ((public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager')
    AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_own_call_logs" ON raw_call_logs;
CREATE POLICY "agent_own_call_logs" ON raw_call_logs FOR SELECT TO authenticated
  USING (agent_id = auth.uid() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_insert_own_call_logs" ON raw_call_logs;
CREATE POLICY "agent_insert_own_call_logs" ON raw_call_logs FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() AND org_id = public.current_org_id());

-- ------------------------------------------------------------
-- Smaller write-path gaps: add org_id to the DELETE-only permission
-- policies, and drop agent_attendance's redundant extra INSERT policy
-- (agent_create_own_attendance, from batch 2, already covers this
-- correctly with an org_id check).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "can_delete_permission_customers" ON customers;
CREATE POLICY "can_delete_permission_customers" ON customers FOR DELETE TO authenticated
  USING (COALESCE((SELECT (permissions->>'can_delete')::boolean FROM profiles WHERE id = auth.uid()), false)
    AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "can_delete_permission_orders" ON orders;
CREATE POLICY "can_delete_permission_orders" ON orders FOR DELETE TO authenticated
  USING (COALESCE((SELECT (permissions->>'can_delete')::boolean FROM profiles WHERE id = auth.uid()), false)
    AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "auth_insert_own" ON agent_attendance;
