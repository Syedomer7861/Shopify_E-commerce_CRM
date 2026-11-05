-- Phase 1b, batch 1: org-scope RLS on core CRM tables (customers, orders,
-- tasks, call_logs, abandoned_carts). Every existing policy below is
-- reproduced exactly as it stands today (traced through
-- 20260822b_enable_rls_everywhere.sql, 20260427_rls_hardening.sql,
-- 20260826e_harden_abandoned_carts_rls.sql — the latest hardening pass for
-- each) with `AND org_id = public.current_org_id()` added. Role logic
-- (admin/manager/agent-ownership) is untouched.
--
-- Also switches org_id's column DEFAULT from the static seed-org lookup
-- (default_org_id(), set in Phase 1a) to public.current_org_id() — so a new
-- row defaults to the INSERTING USER's org, not always CureForever. Harmless
-- today (one org = same result either way) and makes INSERT correct the
-- moment a second org exists, with no app-code change needed for org_id
-- specifically. Apply this same default swap to every table as its RLS gets
-- hardened in later batches.

ALTER TABLE customers       ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE orders          ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE tasks           ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE call_logs       ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE abandoned_carts ALTER COLUMN org_id SET DEFAULT public.current_org_id();

-- customers
DROP POLICY IF EXISTS "admin_all_customers" ON customers;
CREATE POLICY "admin_all_customers" ON customers FOR ALL TO authenticated
  USING (public.is_admin() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_read_customers" ON customers;
CREATE POLICY "agent_read_customers" ON customers FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_update_customers" ON customers;
CREATE POLICY "agent_update_customers" ON customers FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

-- orders
DROP POLICY IF EXISTS "admin_all_orders" ON orders;
CREATE POLICY "admin_all_orders" ON orders FOR ALL TO authenticated
  USING (public.is_admin() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_read_orders" ON orders;
CREATE POLICY "agent_read_orders" ON orders FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

-- tasks
DROP POLICY IF EXISTS "admin_all_tasks" ON tasks;
CREATE POLICY "admin_all_tasks" ON tasks FOR ALL TO authenticated
  USING (
    (public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager')
    AND org_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "agent_own_tasks" ON tasks;
CREATE POLICY "agent_own_tasks" ON tasks FOR SELECT TO authenticated
  USING ((assigned_to = auth.uid() OR assigned_to IS NULL) AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_update_own_tasks" ON tasks;
CREATE POLICY "agent_update_own_tasks" ON tasks FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() AND org_id = public.current_org_id())
  WITH CHECK (assigned_to = auth.uid() AND org_id = public.current_org_id());

-- call_logs
DROP POLICY IF EXISTS "admin_all_call_logs" ON call_logs;
CREATE POLICY "admin_all_call_logs" ON call_logs FOR ALL TO authenticated
  USING (public.is_admin() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_create_call_logs" ON call_logs;
CREATE POLICY "agent_create_call_logs" ON call_logs FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_read_call_logs" ON call_logs;
CREATE POLICY "agent_read_call_logs" ON call_logs FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

-- abandoned_carts
DROP POLICY IF EXISTS "admin_all_abandoned_carts" ON abandoned_carts;
CREATE POLICY "admin_all_abandoned_carts" ON abandoned_carts FOR ALL TO authenticated
  USING (public.is_admin() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_read_abandoned_carts" ON abandoned_carts;
CREATE POLICY "agent_read_abandoned_carts" ON abandoned_carts FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_write_abandoned_carts" ON abandoned_carts;
CREATE POLICY "agent_write_abandoned_carts" ON abandoned_carts FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "agent_update_abandoned_carts" ON abandoned_carts;
CREATE POLICY "agent_update_abandoned_carts" ON abandoned_carts FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());
