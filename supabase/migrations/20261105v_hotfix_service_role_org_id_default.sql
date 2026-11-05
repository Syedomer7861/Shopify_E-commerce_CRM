-- CRITICAL HOTFIX. Confirmed live: a service-role insert into `customers`
-- with no explicit org_id fails with "null value in column org_id violates
-- not-null constraint". Root cause: every org_id DEFAULT set across Phase 1
-- (20261105c/d/f/g/i, plus 20261105r) is `public.current_org_id()`, which
-- resolves via `auth.uid()` — and a service-role call (every webhook:
-- Shiprocket, Shopify, WhatsApp; every cron job; any script using
-- SUPABASE_SERVICE_ROLE_KEY) has no authenticated user, so auth.uid() is
-- NULL, so current_org_id() is NULL, so the NOT NULL constraint on org_id
-- rejects the insert outright.
--
-- Practical impact: since 20261105c landed today, every one of these ~45
-- tables has been rejecting any service-role insert that doesn't set
-- org_id explicitly — which is all of them, since none of the webhook/cron
-- code was written to do that (it predates multi-tenancy). Real Shiprocket/
-- Shopify/WhatsApp webhook events have likely been failing silently (the
-- webhook handlers log the error and return 200 regardless, so the sending
-- service sees no failure).
--
-- Fix: COALESCE to the seed org when there's no authenticated session.
-- This is a stopgap, not the real multi-tenant answer — a service-role
-- write still can't know which of several real tenants it belongs to, it
-- just assumes CureForever (today's only tenant with live integrations).
-- Proper per-org webhook routing (matching by shop domain / phone number
-- ID / a per-org webhook token) is separate, larger follow-up work.
-- Authenticated user sessions are completely unaffected — current_org_id()
-- still resolves their real org first; COALESCE only kicks in when it's
-- NULL.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers', 'orders', 'tasks', 'call_logs', 'abandoned_carts', 'profiles',
    'agent_attendance', 'leaves', 'agent_activity_logs', 'announcements',
    'salary_revisions', 'expenses', 'performance_reviews', 'training_assignments',
    'grievances', 'payroll_runs', 'attendance_log', 'hr_policies', 'holidays',
    'mkt_spaces', 'mkt_space_members', 'mkt_lists', 'mkt_tasks', 'mkt_comments',
    'mkt_task_links', 'mkt_attachments', 'mkt_automations', 'mkt_templates',
    'mkt_intake_requests', 'mkt_saved_views', 'mkt_time_entries', 'mkt_goals',
    'mkt_comment_snippets', 'channels', 'channel_members', 'messages',
    'message_receipts', 'audit_logs', 'product_overrides', 'pincode_metrics',
    'settings', 'webhook_logs', 'lead_scores', 'campaign_templates', 'campaigns',
    'workflows', 'workflow_steps', 'workflow_instances', 'workflow_logs',
    'whatsapp_messages', 'personal_todos', 'personal_notes', 'personal_reminders',
    'campaign_recipients', 'push_subscriptions', 'product_catalog', 'notifications',
    'rollup_daily_orders', 'rollup_daily_state_orders', 'raw_call_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id') THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN org_id SET DEFAULT COALESCE(public.current_org_id(), public.default_org_id())', t);
    END IF;
  END LOOP;
END
$$;
