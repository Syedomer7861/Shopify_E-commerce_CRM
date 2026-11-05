-- Phase 6a prep: Phase 2a seeded the 5 system roles for CureForever only
-- (hardcoded to default_org_id()). Any new org created via the upcoming
-- signup flow would have zero rows in `roles`, and its first admin's
-- profile insert would fail validate_profile_role()'s trigger (role must
-- exist in roles for that org_id) — a real blocker, not just an edge case,
-- since the admin row is the FIRST thing created for a new org.
--
-- Fix: a reusable seed function, triggered automatically whenever a new
-- organizations row is inserted, so every org (however it's created) gets
-- its 5 default roles without the signup flow needing to know about it.

CREATE OR REPLACE FUNCTION public.seed_default_roles(target_org_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO roles (org_id, name, is_system, permissions, nav_modules)
  SELECT target_org_id, v.name, true, v.permissions::jsonb, v.nav_modules
  FROM (VALUES
    ('admin',     '{}'::jsonb, NULL::text[]),
    ('agent',     '{"view_analytics": false, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": true, "manage_customers": true, "send_whatsapp": true, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb, NULL::text[]),
    ('hr',        '{"view_analytics": true, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": true, "manage_customers": true, "send_whatsapp": true, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb, NULL::text[]),
    ('manager',   '{"view_analytics": true, "can_import": true, "can_delete": false, "manage_team": true, "manage_orders": true, "manage_customers": true, "send_whatsapp": true, "audit_tasks": true, "manage_automations": true, "manage_marketing": true, "manage_workspaces": true}'::jsonb, NULL::text[]),
    ('marketing', '{"view_analytics": true, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": false, "manage_customers": true, "send_whatsapp": true, "audit_tasks": false, "manage_automations": false, "manage_marketing": true, "manage_workspaces": false}'::jsonb, ARRAY['my-hub','chat','request-creative'])
  ) AS v(name, permissions, nav_modules)
  WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.org_id = target_org_id AND r.name = v.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_seed_default_roles_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.seed_default_roles(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_roles ON organizations;
CREATE TRIGGER trg_seed_default_roles
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_default_roles_fn();
