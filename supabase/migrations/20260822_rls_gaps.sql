-- ============================================================
-- RLS gap closure + schema drift repair.
--
-- Safe to re-run. Every statement is guarded, because production is missing
-- tables and columns that earlier migrations were supposed to create
-- (20260411_initial_scaling.sql was never applied there).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Role helpers.
--    is_admin() is referenced by policies in 20240424_chat_system.sql and
--    20260427_rls_hardening.sql but was never defined in any migration.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$fn$;

CREATE OR REPLACE FUNCTION public.has_role(target text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = target);
$fn$;

-- ------------------------------------------------------------
-- 1. Schema drift: tables and columns the app queries that are missing in
--    production. Same definitions as 20260411_initial_scaling.sql.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_scores (
    customer_id        UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    score              INTEGER NOT NULL DEFAULT 0,
    factors            JSONB NOT NULL DEFAULT '[]',
    last_calculated_at TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_templates (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255) NOT NULL UNIQUE,
    body       TEXT NOT NULL,
    category   VARCHAR(50) CHECK (category IN ('recovery','reorder','feedback','marketing','custom')),
    variables  JSONB DEFAULT '[]',
    is_active  BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(255) NOT NULL,
    template_id      UUID REFERENCES campaign_templates(id) ON DELETE SET NULL,
    status           VARCHAR(20) DEFAULT 'draft'
                     CHECK (status IN ('draft','scheduled','running','completed','paused','failed')),
    target_segment   VARCHAR(50),
    total_recipients INTEGER DEFAULT 0,
    delivered_count  INTEGER DEFAULT 0,
    read_count       INTEGER DEFAULT 0,
    failed_count     INTEGER DEFAULT 0,
    scheduled_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- The Shopify and Shiprocket webhooks write orders.custom_meta on every
-- order. Without the column each upsert fails with 42703.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS custom_meta JSONB DEFAULT '{}';

-- ------------------------------------------------------------
-- 2. Tables that had no RLS at all: reachable with the public anon key.
-- ------------------------------------------------------------
ALTER TABLE campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scores        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_campaigns" ON campaigns;
CREATE POLICY "auth_all_campaigns" ON campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_campaign_templates" ON campaign_templates;
CREATE POLICY "auth_all_campaign_templates" ON campaign_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_lead_scores" ON lead_scores;
CREATE POLICY "auth_all_lead_scores" ON lead_scores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 3. webhook_logs had only a service_role policy, but the API routes run on
--    the anon key. Every webhook insert failed with 42501, returned null,
--    and the follow-up update then sent `id=eq.undefined` (22P02).
--    The routes now use the admin client; this adds the dashboard read.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "auth_read_webhook_logs" ON webhook_logs;
CREATE POLICY "auth_read_webhook_logs" ON webhook_logs
  FOR SELECT TO authenticated USING (true);

-- ------------------------------------------------------------
-- 4. HR tables were "FOR ALL TO authenticated USING (true)": any agent could
--    read and edit every salary, expense, review and grievance.
--    Guarded, since these exist only if the HR suite migration ran.
-- ------------------------------------------------------------
DO $mig$
BEGIN
  IF to_regclass('public.salary_revisions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "auth_all_salary_revisions" ON salary_revisions;
    DROP POLICY IF EXISTS "hr_admin_manage_salary" ON salary_revisions;
    DROP POLICY IF EXISTS "employee_read_own_salary" ON salary_revisions;
    CREATE POLICY "hr_admin_manage_salary" ON salary_revisions
      FOR ALL TO authenticated
      USING (public.is_admin() OR public.has_role('hr'))
      WITH CHECK (public.is_admin() OR public.has_role('hr'));
    CREATE POLICY "employee_read_own_salary" ON salary_revisions
      FOR SELECT TO authenticated USING (agent_id = auth.uid());
  END IF;

  IF to_regclass('public.performance_reviews') IS NOT NULL THEN
    DROP POLICY IF EXISTS "auth_all_performance_reviews" ON performance_reviews;
    DROP POLICY IF EXISTS "hr_admin_manage_reviews" ON performance_reviews;
    DROP POLICY IF EXISTS "employee_read_own_reviews" ON performance_reviews;
    CREATE POLICY "hr_admin_manage_reviews" ON performance_reviews
      FOR ALL TO authenticated
      USING (public.is_admin() OR public.has_role('hr') OR public.has_role('manager'))
      WITH CHECK (public.is_admin() OR public.has_role('hr') OR public.has_role('manager'));
    CREATE POLICY "employee_read_own_reviews" ON performance_reviews
      FOR SELECT TO authenticated USING (agent_id = auth.uid());
  END IF;

  IF to_regclass('public.expenses') IS NOT NULL THEN
    DROP POLICY IF EXISTS "auth_all_expenses" ON expenses;
    DROP POLICY IF EXISTS "hr_admin_manage_expenses" ON expenses;
    DROP POLICY IF EXISTS "employee_own_expenses" ON expenses;
    DROP POLICY IF EXISTS "employee_create_own_expenses" ON expenses;
    CREATE POLICY "hr_admin_manage_expenses" ON expenses
      FOR ALL TO authenticated
      USING (public.is_admin() OR public.has_role('hr'))
      WITH CHECK (public.is_admin() OR public.has_role('hr'));
    CREATE POLICY "employee_own_expenses" ON expenses
      FOR SELECT TO authenticated USING (agent_id = auth.uid());
    CREATE POLICY "employee_create_own_expenses" ON expenses
      FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());
  END IF;

  IF to_regclass('public.grievances') IS NOT NULL THEN
    DROP POLICY IF EXISTS "auth_all_grievances" ON grievances;
    DROP POLICY IF EXISTS "hr_admin_manage_grievances" ON grievances;
    DROP POLICY IF EXISTS "employee_own_grievances" ON grievances;
    DROP POLICY IF EXISTS "employee_file_own_grievances" ON grievances;
    CREATE POLICY "hr_admin_manage_grievances" ON grievances
      FOR ALL TO authenticated
      USING (public.is_admin() OR public.has_role('hr'))
      WITH CHECK (public.is_admin() OR public.has_role('hr'));
    CREATE POLICY "employee_own_grievances" ON grievances
      FOR SELECT TO authenticated USING (agent_id = auth.uid());
    CREATE POLICY "employee_file_own_grievances" ON grievances
      FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());
  END IF;
END
$mig$;

-- ------------------------------------------------------------
-- 5. Chat moves from the standalone socket.io server to Supabase Realtime so
--    it runs on Vercel. Realtime only streams tables in the publication.
-- ------------------------------------------------------------
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'channel_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;
  END IF;
END
$pub$;

-- A member must be able to read and update their own membership row
-- (unread tracking). Previously only is_admin() could.
DROP POLICY IF EXISTS "members_read_own" ON channel_members;
CREATE POLICY "members_read_own" ON channel_members
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "members_update_own" ON channel_members;
CREATE POLICY "members_update_own" ON channel_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
