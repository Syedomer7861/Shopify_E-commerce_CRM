-- Fix: "infinite recursion detected in policy for relation channel_members",
-- hit live right after 20261105g_tenancy_rls_chat.sql. users_see_channel_members
-- queries channel_members from inside channel_members' own policy (a
-- self-join) — Postgres can't resolve that directly. channels' and
-- messages' policies have the same shape querying INTO channel_members
-- from another table's policy, which inherits the same problem once
-- channel_members' own policy can't evaluate.
--
-- Root-cause fix, not a per-policy patch: wrap the lookup in a
-- SECURITY DEFINER function, same trick is_admin() already uses to avoid
-- this exact class of recursion on profiles (see schema.sql's comment on
-- it). SECURITY DEFINER bypasses RLS on the inner query, so there's no
-- self-reference left to recurse on.

CREATE OR REPLACE FUNCTION public.my_channel_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid();
$fn$;

-- channel_members
DROP POLICY IF EXISTS "users_see_channel_members" ON channel_members;
CREATE POLICY "users_see_channel_members" ON channel_members FOR SELECT TO authenticated
  USING (
    (channel_id IN (SELECT public.my_channel_ids()) OR public.is_admin())
    AND org_id = public.current_org_id()
  );

-- channels
DROP POLICY IF EXISTS "members_delete_channels" ON channels;
CREATE POLICY "members_delete_channels" ON channels FOR DELETE TO authenticated
  USING (id IN (SELECT public.my_channel_ids()) AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "users_see_own_channels" ON channels;
CREATE POLICY "users_see_own_channels" ON channels FOR SELECT TO authenticated
  USING (
    (id IN (SELECT public.my_channel_ids())
      OR public.is_admin()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager')
    AND org_id = public.current_org_id()
  );

-- messages
DROP POLICY IF EXISTS "messages_view_members" ON messages;
CREATE POLICY "messages_view_members" ON messages FOR SELECT TO authenticated
  USING (
    (channel_id IN (SELECT public.my_channel_ids()) OR public.is_admin())
    AND org_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "messages_send_members" ON messages;
CREATE POLICY "messages_send_members" ON messages FOR INSERT TO authenticated
  WITH CHECK (
    (channel_id IN (SELECT public.my_channel_ids()) OR public.is_admin())
    AND org_id = public.current_org_id()
  );
