-- Phase 1b, batch 6 (final): org-scope the remaining tables, PLUS gap
-- fixes found while tracing this batch — two earlier batches missed extra
-- policies added by 20260822_rls_gaps.sql, a migration dated AFTER the
-- "latest hardening" files those batches traced, so it was never checked:
--
--   * channel_members: members_read_own / members_update_own (missed in
--     batch 5, the chat batch)
--   * salary_revisions / performance_reviews / expenses / grievances: each
--     has an extra admin-or-hr "manage" policy (different NAME from the one
--     batch 2 fixed) plus an employee-read/create-own policy — both live,
--     neither org-scoped (missed in batch 2, the HR batch)
--
-- Also found while tracing: workflow_steps / workflow_instances /
-- workflow_logs each carry TWO duplicate FOR-ALL-USING(true) policies under
-- different names (base migration's auth_all_steps/instances/logs, and
-- 20260822c_workflows_rls.sql's auth_all_workflow_steps/instances/logs) —
-- same semantics, never deduped. Consolidated to one org-scoped policy each.
--
-- Also found: order_revenue_attribution has NO RLS at all (not even a
-- blanket USING(true) policy) — reachable with the anon key, the exact
-- class of gap 20260822b's intro comment describes. Added RLS + a policy
-- matching agent_activity_logs' access model, since it's derived from that
-- table's data.
--
-- Everything else here is a direct, mechanical org_id append, same as
-- every batch before it.

ALTER TABLE audit_logs          ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE product_overrides   ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE pincode_metrics     ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE settings            ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE webhook_logs        ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE lead_scores         ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE campaign_templates  ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE campaigns           ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE workflows           ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE workflow_steps      ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE workflow_instances  ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE workflow_logs       ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE whatsapp_messages   ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE personal_todos      ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE personal_notes      ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE personal_reminders  ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE campaign_recipients ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE push_subscriptions  ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE product_catalog     ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE notifications       ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE rollup_daily_orders       ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE rollup_daily_state_orders ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE order_revenue_attribution ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)
  DEFAULT public.current_org_id();
UPDATE order_revenue_attribution SET org_id = public.default_org_id() WHERE org_id IS NULL;
ALTER TABLE order_revenue_attribution ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_revenue_attribution_org_id ON order_revenue_attribution(org_id);

-- ------------------------------------------------------------
-- Gap fix: channel_members (missed in batch 5)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "members_read_own" ON channel_members;
CREATE POLICY "members_read_own" ON channel_members FOR SELECT TO authenticated
  USING ((user_id = auth.uid() OR public.is_admin()) AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "members_update_own" ON channel_members;
CREATE POLICY "members_update_own" ON channel_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND org_id = public.current_org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = public.current_org_id());

-- ------------------------------------------------------------
-- Gap fix: salary_revisions / performance_reviews / expenses / grievances
-- (missed in batch 2 — 20260822_rls_gaps.sql's extra policies, never dropped)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "hr_admin_manage_salary" ON salary_revisions;
CREATE POLICY "hr_admin_manage_salary" ON salary_revisions FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "employee_read_own_salary" ON salary_revisions;
CREATE POLICY "employee_read_own_salary" ON salary_revisions FOR SELECT TO authenticated
  USING (agent_id = auth.uid() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "hr_admin_manage_reviews" ON performance_reviews;
CREATE POLICY "hr_admin_manage_reviews" ON performance_reviews FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr') OR public.has_role('manager')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr') OR public.has_role('manager')) AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "employee_read_own_reviews" ON performance_reviews;
CREATE POLICY "employee_read_own_reviews" ON performance_reviews FOR SELECT TO authenticated
  USING (agent_id = auth.uid() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "hr_admin_manage_expenses" ON expenses;
CREATE POLICY "hr_admin_manage_expenses" ON expenses FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "employee_own_expenses" ON expenses;
CREATE POLICY "employee_own_expenses" ON expenses FOR SELECT TO authenticated
  USING (agent_id = auth.uid() AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "employee_create_own_expenses" ON expenses;
CREATE POLICY "employee_create_own_expenses" ON expenses FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "hr_admin_manage_grievances" ON grievances;
CREATE POLICY "hr_admin_manage_grievances" ON grievances FOR ALL TO authenticated
  USING ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.has_role('hr')) AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "employee_own_grievances" ON grievances;
CREATE POLICY "employee_own_grievances" ON grievances FOR SELECT TO authenticated
  USING (agent_id = auth.uid() AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "employee_file_own_grievances" ON grievances;
CREATE POLICY "employee_file_own_grievances" ON grievances FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() AND org_id = public.current_org_id());

-- ------------------------------------------------------------
-- audit_logs / product_overrides / pincode_metrics: still the original
-- schema.sql blanket policy, never hardened since.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "auth_all" ON audit_logs;
CREATE POLICY "auth_all" ON audit_logs FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "auth_all" ON product_overrides;
CREATE POLICY "auth_all" ON product_overrides FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "auth_all" ON pincode_metrics;
CREATE POLICY "auth_all" ON pincode_metrics FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

-- settings: admin-only already (20260826d_lock_down_settings_secrets.sql).
-- settings_public view is unaffected (deliberately bypasses RLS) — it reads
-- the single global row; true per-org settings is the already-deferred
-- app-code work, unchanged by this migration.
DROP POLICY IF EXISTS "admin_manage_settings" ON settings;
CREATE POLICY "admin_manage_settings" ON settings FOR ALL TO authenticated
  USING (public.is_admin() AND org_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND org_id = public.current_org_id());

-- webhook_logs: service_all (service_role) is untouched — service_role
-- bypasses RLS by default in Supabase regardless of policy content.
DROP POLICY IF EXISTS "auth_read_webhook_logs" ON webhook_logs;
CREATE POLICY "auth_read_webhook_logs" ON webhook_logs FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

-- lead_scores / campaign_templates / campaigns: still blanket from
-- 20260822_rls_gaps.sql.
DROP POLICY IF EXISTS "auth_all_lead_scores" ON lead_scores;
CREATE POLICY "auth_all_lead_scores" ON lead_scores FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "auth_all_campaign_templates" ON campaign_templates;
CREATE POLICY "auth_all_campaign_templates" ON campaign_templates FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "auth_all_campaigns" ON campaigns;
CREATE POLICY "auth_all_campaigns" ON campaigns FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

-- workflows: single policy, still blanket.
DROP POLICY IF EXISTS "auth_all_workflows" ON workflows;
CREATE POLICY "auth_all_workflows" ON workflows FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

-- workflow_steps / workflow_instances / workflow_logs: dedupe the 2 live
-- policies per table down to 1, org-scoped.
DROP POLICY IF EXISTS "auth_all_steps" ON workflow_steps;
DROP POLICY IF EXISTS "auth_all_workflow_steps" ON workflow_steps;
CREATE POLICY "auth_all_workflow_steps" ON workflow_steps FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "auth_all_instances" ON workflow_instances;
DROP POLICY IF EXISTS "auth_all_workflow_instances" ON workflow_instances;
CREATE POLICY "auth_all_workflow_instances" ON workflow_instances FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "auth_all_logs" ON workflow_logs;
DROP POLICY IF EXISTS "auth_all_workflow_logs" ON workflow_logs;
CREATE POLICY "auth_all_workflow_logs" ON workflow_logs FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

-- whatsapp_messages: still blanket.
DROP POLICY IF EXISTS "auth_all_messages" ON whatsapp_messages;
CREATE POLICY "auth_all_messages" ON whatsapp_messages FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

-- personal_todos / personal_notes / personal_reminders: own rows only.
DROP POLICY IF EXISTS "own_personal_todos" ON personal_todos;
CREATE POLICY "own_personal_todos" ON personal_todos FOR ALL TO authenticated
  USING (user_id = auth.uid() AND org_id = public.current_org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "own_personal_notes" ON personal_notes;
CREATE POLICY "own_personal_notes" ON personal_notes FOR ALL TO authenticated
  USING (user_id = auth.uid() AND org_id = public.current_org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "own_personal_reminders" ON personal_reminders;
CREATE POLICY "own_personal_reminders" ON personal_reminders FOR ALL TO authenticated
  USING (user_id = auth.uid() AND org_id = public.current_org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = public.current_org_id());

-- campaign_recipients: still blanket.
DROP POLICY IF EXISTS "auth_all" ON campaign_recipients;
CREATE POLICY "auth_all" ON campaign_recipients FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

-- push_subscriptions: own rows only, no update policy (replace via delete+insert).
DROP POLICY IF EXISTS "push_subscriptions_select_own" ON push_subscriptions;
CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "push_subscriptions_insert_own" ON push_subscriptions;
CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "push_subscriptions_delete_own" ON push_subscriptions;
CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND org_id = public.current_org_id());

-- product_catalog: read-only for every authenticated caller.
DROP POLICY IF EXISTS "agent_read_product_catalog" ON product_catalog;
CREATE POLICY "agent_read_product_catalog" ON product_catalog FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

-- notifications: own rows only, no insert/delete policy (service role writes).
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND org_id = public.current_org_id())
  WITH CHECK (auth.uid() = user_id AND org_id = public.current_org_id());

-- rollup_daily_orders / rollup_daily_state_orders: read-only, written only
-- by the SECURITY DEFINER rebuild_* functions (service_role, bypasses RLS).
DROP POLICY IF EXISTS "rollup_daily_orders_read" ON rollup_daily_orders;
CREATE POLICY "rollup_daily_orders_read" ON rollup_daily_orders FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
DROP POLICY IF EXISTS "rollup_daily_state_orders_read" ON rollup_daily_state_orders;
CREATE POLICY "rollup_daily_state_orders_read" ON rollup_daily_state_orders FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

-- order_revenue_attribution: NO RLS existed at all (reachable with the anon
-- key). Enabling it now with the same access model as agent_activity_logs,
-- the table it's derived from.
ALTER TABLE order_revenue_attribution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manager_all_revenue_attribution" ON order_revenue_attribution;
CREATE POLICY "admin_manager_all_revenue_attribution" ON order_revenue_attribution FOR SELECT TO authenticated
  USING ((public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager')
    AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "agent_own_revenue_attribution" ON order_revenue_attribution;
CREATE POLICY "agent_own_revenue_attribution" ON order_revenue_attribution FOR SELECT TO authenticated
  USING (agent_id = auth.uid() AND org_id = public.current_org_id());
