-- Phase 2a: org-scoped roles table. Purely additive — nothing reads from
-- this table yet. profiles.role (the enum column), is_admin()/has_role()/
-- is_marketing_staff()/is_workspace_admin(), every RLS policy's
-- `(SELECT role FROM profiles ...)` check, and permissions.ts's
-- DEFAULT_*_PERMISSIONS switch are all untouched by this migration.
--
-- That's deliberate: those are read by dozens of RLS policies across every
-- Phase 1 batch plus the whole frontend. Rewriting them is Phase 2b+ and
-- needs its own careful pass (and an admin UI), same reason Phase 1 was
-- split into 6 verified batches instead of one migration.
--
-- is_system roles mirror today's 5 hardcoded roles 1:1, permissions copied
-- from src/lib/permissions.ts's DEFAULT_*_PERMISSIONS so the data is ready
-- to wire up later without re-deriving it. is_system rows can't be deleted
-- (enforced below) since profiles.role still points at these names.

CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) DEFAULT public.current_org_id(),
  name        VARCHAR(50) NOT NULL,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  nav_modules TEXT[],
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_org_id ON roles(org_id);

CREATE OR REPLACE FUNCTION public.roles_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_roles_touch ON roles;
CREATE TRIGGER trg_roles_touch BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION public.roles_touch_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_system_role_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'Cannot delete a system role (%).', OLD.name;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_system_role_delete ON roles;
CREATE TRIGGER trg_prevent_system_role_delete BEFORE DELETE ON roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_system_role_delete();

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Any org member can read roles (needed for assignment dropdowns); only
-- admins or workspace-admins manage them.
DROP POLICY IF EXISTS "roles_read" ON roles;
CREATE POLICY "roles_read" ON roles FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "roles_manage" ON roles;
CREATE POLICY "roles_manage" ON roles FOR ALL TO authenticated
  USING ((public.is_admin() OR public.is_workspace_admin()) AND org_id = public.current_org_id())
  WITH CHECK ((public.is_admin() OR public.is_workspace_admin()) AND org_id = public.current_org_id());

-- Seed the 5 existing roles for CureForever, matching
-- src/lib/permissions.ts's DEFAULT_*_PERMISSIONS verbatim.
INSERT INTO roles (org_id, name, is_system, permissions, nav_modules)
SELECT public.default_org_id(), v.name, true, v.permissions::jsonb, v.nav_modules
FROM (VALUES
  ('admin',     '{}'::jsonb, NULL::text[]),  -- is_admin() already grants everything; no flags needed
  ('agent',     '{"view_analytics": false, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": true, "manage_customers": true, "send_whatsapp": true, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb, NULL::text[]),
  ('hr',        '{"view_analytics": true, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": true, "manage_customers": true, "send_whatsapp": true, "audit_tasks": false, "manage_automations": false, "manage_marketing": false, "manage_workspaces": false}'::jsonb, NULL::text[]),
  ('manager',   '{"view_analytics": true, "can_import": true, "can_delete": false, "manage_team": true, "manage_orders": true, "manage_customers": true, "send_whatsapp": true, "audit_tasks": true, "manage_automations": true, "manage_marketing": true, "manage_workspaces": true}'::jsonb, NULL::text[]),
  ('marketing', '{"view_analytics": true, "can_import": false, "can_delete": false, "manage_team": false, "manage_orders": false, "manage_customers": true, "send_whatsapp": true, "audit_tasks": false, "manage_automations": false, "manage_marketing": true, "manage_workspaces": false}'::jsonb, ARRAY['my-hub','chat','request-creative'])
) AS v(name, permissions, nav_modules)
WHERE NOT EXISTS (
  SELECT 1 FROM roles r WHERE r.org_id = public.default_org_id() AND r.name = v.name
);
