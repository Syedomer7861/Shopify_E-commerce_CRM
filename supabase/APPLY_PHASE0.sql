-- Phase 0: paste this whole file into the Supabase SQL Editor and run once.
-- Safe to re-run. Order matters: the leak fix is first.

-- ============================================================
-- 20261111a_lock_down_agent_performance_view.sql
-- ============================================================
-- SECURITY HOTFIX. Found by a live probe on 2026-11-11: v_agent_performance
-- returns all 17 rows (every org's agent names, emails, call counts and
-- recovered revenue) to a caller holding only the public anon key - i.e.
-- logged out - and to any signed-in user of any other org.
--
-- Cause: a Postgres view runs with its OWNER's rights by default, so the
-- org-scoped RLS on profiles/call_logs/tasks/orders underneath is never
-- consulted, and the default Supabase grants let anon SELECT it. Every
-- other table/view passed the same probe; this is the one exception.
--
-- security_invoker makes the view obey the caller's own RLS (an org member
-- sees their org; service-role callers such as the daily-digest cron are
-- unaffected). The REVOKE removes logged-out access outright.

ALTER VIEW public.v_agent_performance SET (security_invoker = true);
REVOKE ALL ON public.v_agent_performance FROM anon;

-- Verify after applying (run as-is in the SQL Editor; expect 0 for anon):
--   SET ROLE anon; SELECT count(*) FROM v_agent_performance; RESET ROLE;

-- ============================================================
-- 20261105p_recreate_signup_trigger.sql
-- ============================================================
-- The on_auth_user_created trigger (created in Phase 0's
-- 20261105_tenancy_foundation.sql, confirmed successful at the time) is
-- gone from pg_trigger entirely — not disabled, not renamed, just absent.
-- Root cause unconfirmed (possibly a Supabase platform-level auth-schema
-- operation), but the practical fix is the same either way: recreate it.
--
-- Without it, auth.users gets a row on signup but profiles never does —
-- not a security leak (RLS still has nothing to match, so the new user
-- sees nothing), but it leaves every new signup stuck with no role and no
-- permissions. Confirmed missing via the Phase 6a signup test.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, org_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', ''),
    CASE
      WHEN new.raw_user_meta_data->>'role' IN ('admin', 'agent', 'manager', 'hr', 'marketing')
      THEN new.raw_user_meta_data->>'role'
      ELSE 'agent'
    END,
    COALESCE(
      (new.raw_user_meta_data->>'org_id')::uuid,
      public.default_org_id()
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill the Phase 6a test user, which signed up while the trigger was
-- missing and so never got a profiles row.
INSERT INTO public.profiles (id, email, name, role, org_id)
SELECT u.id, u.email,
  COALESCE(u.raw_user_meta_data->>'name', ''),
  COALESCE(u.raw_user_meta_data->>'role', 'agent'),
  (u.raw_user_meta_data->>'org_id')::uuid
FROM auth.users u
WHERE u.email = 'test-phase6-signup@example.com'
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- ============================================================
-- 20261106c_designation_rbac_template.sql
-- ============================================================
-- Finishes wiring the dynamic roles system (roles table, Roles page,
-- validate_profile_role trigger) that Phase 2a/2b built but never fully
-- connected: normalizePermissions()/allowedNavModules() in
-- src/lib/permissions.ts now read a role's live definition from `roles`
-- (via useCurrentProfile), not just the 5 hardcoded defaults. This migration
-- is the DB half: it (a) tightens the two system roles that were wide open
-- by default (agent, hr previously had nav_modules = NULL = every page) and
-- (b) extends seed_default_roles() with a starter set of e-commerce-ops
-- designations, so every NEW org gets a sensible RBAC structure out of the
-- box instead of 5 generic roles.
--
-- Existing orgs are untouched by the seed-function change (it only fires on
-- org creation). To apply the tightened agent/hr defaults, or add the new
-- designations, to an org that already exists (including this one), run the
-- two statements at the bottom against that org_id - commented out here
-- because touching a live org's roles should be a deliberate choice, not a
-- migration side effect.

CREATE OR REPLACE FUNCTION public.seed_default_roles(target_org_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO roles (org_id, name, is_system, permissions, nav_modules)
  SELECT target_org_id, v.name, v.is_system, v.permissions::jsonb, v.nav_modules
  FROM (VALUES
    -- ── The 5 original system roles (is_system = true: name locked, can't
    --    be deleted) - agent and hr now ship with a scoped nav_modules
    --    allowlist instead of NULL (every page). manager/admin stay
    --    unrestricted, matching "managers and admins get higher-level access".
    ('admin',     true,  '{}'::jsonb,
      NULL::text[]),
    ('agent',     true,  '{"view_analytics": false, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": true, "manage_customers": true, "send_whatsapp": true, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb,
      ARRAY['dashboard','tasks','chat','my-hub','customers','orders','calendar','performance','abandoned-carts','recordings']),
    ('hr',        true,  '{"view_analytics": true, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": true, "manage_customers": true, "send_whatsapp": true, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb,
      ARRAY['dashboard','my-hub','chat','calendar','hr','performance']),
    ('manager',   true,  '{"view_analytics": true, "can_import": true, "can_delete": false, "manage_team": true, "manage_orders": true, "manage_customers": true, "send_whatsapp": true, "audit_tasks": true, "manage_automations": true, "manage_marketing": true, "manage_workspaces": true}'::jsonb,
      NULL::text[]),
    ('marketing', true,  '{"view_analytics": true, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": false, "manage_customers": true, "send_whatsapp": true, "audit_tasks": false, "manage_automations": false, "manage_marketing": true, "manage_workspaces": false}'::jsonb,
      ARRAY['my-hub','chat','request-creative','calendar']),

    -- ── New designations (is_system = false: admin can rename/delete/edit
    --    freely on the Roles page; these are just a sensible starting point).
    -- Finance: order/revenue visibility for reconciliation, no HR/team/ops access.
    ('accountant',          false, '{"view_analytics": true, "can_import": true, "can_delete": false, "manage_team": false, "manage_orders": true, "manage_customers": false, "send_whatsapp": false, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb,
      ARRAY['dashboard','my-hub','chat','orders','customers','calendar','reports']),
    -- Shipping/fulfillment oversight: orders + RTO/abandoned-cart visibility.
    ('logistics_manager',   false, '{"view_analytics": true, "can_import": true, "can_delete": false, "manage_team": false, "manage_orders": true, "manage_customers": true, "send_whatsapp": false, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb,
      ARRAY['dashboard','my-hub','chat','orders','customers','calendar','reports','abandoned-carts']),
    -- Cross-marketplace order ops (Amazon/Flipkart/Myntra etc. - no native
    -- integration in this CRM yet, so they get the closest existing surface).
    ('ecommerce_manager',   false, '{"view_analytics": true, "can_import": true, "can_delete": false, "manage_team": false, "manage_orders": true, "manage_customers": true, "send_whatsapp": true, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb,
      ARRAY['dashboard','my-hub','chat','orders','customers','calendar','reports','import','campaigns']),
    -- Creative/content/dev roles: workspace collaborators only, zero CRM
    -- operational permissions - exactly "no Calling or Sales module" access.
    ('meta_ads_specialist', false, '{"view_analytics": false, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": false, "manage_customers": false, "send_whatsapp": false, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb,
      ARRAY['my-hub','chat','request-creative','calendar']),
    ('content_writer',      false, '{"view_analytics": false, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": false, "manage_customers": false, "send_whatsapp": false, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb,
      ARRAY['my-hub','chat','request-creative','calendar']),
    ('graphic_designer',    false, '{"view_analytics": false, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": false, "manage_customers": false, "send_whatsapp": false, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb,
      ARRAY['my-hub','chat','request-creative','calendar']),
    ('video_editor',        false, '{"view_analytics": false, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": false, "manage_customers": false, "send_whatsapp": false, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb,
      ARRAY['my-hub','chat','request-creative','calendar']),
    ('web_developer',       false, '{"view_analytics": false, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": false, "manage_customers": false, "send_whatsapp": false, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb,
      ARRAY['my-hub','chat','calendar'])
    -- "Sales (Call Team)" and "On-Field Sales Team" intentionally reuse the
    -- `agent` role (profiles.role = 'agent') rather than getting their own
    -- row: Tasks/Dashboard/Calendar all branch on the literal string "agent"
    -- for per-user task-queue scoping (see applyAgentFilters in
    -- src/app/(app)/tasks/page.tsx). A new role name would silently drop
    -- that scoping and let them see every other agent's queue. Use the
    -- profiles.designation column (already free-text) to label them
    -- "Sales (Call Team)" / "On-Field Sales Team" instead - same access,
    -- correct job title everywhere the UI displays it.
  ) AS v(name, is_system, permissions, nav_modules)
  WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.org_id = target_org_id AND r.name = v.name)
  ON CONFLICT (org_id, name) DO NOTHING;
END;
$$;

-- To apply this to an ORG THAT ALREADY EXISTS (new orgs get it automatically
-- via the trigger on organizations insert), run in the SQL Editor:
--   SELECT public.seed_default_roles('<org_id>');
--   -- then, if you also want the tightened agent/hr defaults applied to
--   -- accounts created before this migration:
--   UPDATE roles SET nav_modules = ARRAY['dashboard','tasks','chat','my-hub','customers','orders','calendar','performance','abandoned-carts','recordings']
--     WHERE org_id = '<org_id>' AND name = 'agent';
--   UPDATE roles SET nav_modules = ARRAY['dashboard','my-hub','chat','calendar','hr','performance']
--     WHERE org_id = '<org_id>' AND name = 'hr';

-- ============================================================
-- 20261106d_contact_requests.sql
-- ============================================================
-- Self-serve signup is being retired (workspaces are now provisioned by the
-- platform team and handed over with credentials) - this is the landing
-- page's new "Contact Us" destination. Public/anon never gets a write
-- policy here; the only writer is /api/contact, which uses the service-role
-- key (same pattern as /api/signup creating the first org/admin). Reads are
-- platform-admin only, reusing is_platform_admin() from 20261105u.

CREATE TABLE IF NOT EXISTS contact_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  company     VARCHAR(200),
  phone       VARCHAR(50),
  message     TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'provisioned', 'declined')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_status ON contact_requests(status, created_at DESC);

ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_read_contact_requests" ON contact_requests;
CREATE POLICY "platform_admin_read_contact_requests" ON contact_requests FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admin_update_contact_requests" ON contact_requests;
CREATE POLICY "platform_admin_update_contact_requests" ON contact_requests FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- No INSERT policy for anon/authenticated: the public form goes through
-- /api/contact's service-role client, same as /api/signup already does for
-- the (now admin-gated) org/profile creation it performs.
