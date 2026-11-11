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
