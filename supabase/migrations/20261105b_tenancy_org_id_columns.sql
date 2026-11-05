-- Phase 1a: add org_id to every tenant-data table. Pure additive — column
-- defaults to the existing CureForever org (public.default_org_id(), from
-- 20261105_tenancy_foundation.sql), so nothing reads or filters by it yet.
-- No RLS policy is touched here. That's Phase 1b, done table-group by
-- table-group so each batch can be verified before the next.
--
-- `settings` is a special case: today it's a single global row holding
-- Shopify/Shiprocket/WhatsApp/Gmail secrets. Giving it a real org_id here is
-- still safe (single org = still one row), but turning it into true
-- per-org settings needs app code changes wherever it's read — tracked
-- separately, not done in this migration.

DO $$
DECLARE
  t text;
  seed_org uuid := public.default_org_id();
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','orders','tasks','call_logs','audit_logs','settings',
    'product_overrides','webhook_logs','abandoned_carts','pincode_metrics','raw_call_logs',
    'channels','channel_members','messages','message_receipts',
    'agent_activity_logs','lead_scores','campaign_templates','campaigns',
    'workflows','workflow_logs','workflow_steps','workflow_instances',
    'whatsapp_messages',
    'attendance_log','leaves','announcements','hr_policies','salary_revisions',
    'expenses','performance_reviews','training_assignments','grievances',
    'agent_attendance','holidays','payroll_runs',
    'personal_todos','personal_notes','personal_reminders',
    'campaign_recipients','push_subscriptions','product_catalog',
    'order_revenue_attribution','notifications',
    'mkt_lists','mkt_tasks','mkt_comments','mkt_task_links','mkt_attachments',
    'mkt_templates','mkt_automations','mkt_intake_requests','mkt_saved_views',
    'mkt_spaces','mkt_space_members','mkt_time_entries','mkt_goals','mkt_comment_snippets',
    'rollup_daily_orders','rollup_daily_state_orders'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)', t);
      EXECUTE format('UPDATE public.%I SET org_id = $1 WHERE org_id IS NULL', t) USING seed_org;
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET DEFAULT public.default_org_id()', t);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(org_id)', 'idx_' || t || '_org_id', t);
    ELSE
      RAISE NOTICE 'skipping %, table not found', t;
    END IF;
  END LOOP;
END $$;
