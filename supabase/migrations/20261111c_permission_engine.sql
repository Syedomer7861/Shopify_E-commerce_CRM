-- Phase 2 of the platform plan: permission engine.
--
-- Until now a role was 10 on/off flags, so "can approve expenses for their
-- own team but only view the rest" could not be expressed. A role now also
-- carries `grants`: module -> action -> scope, e.g.
--   {"expenses": {"view": "team", "approve": "team"}, "leads": {"view": "own"}}
-- Scopes: own | assigned | team | department | branch | organisation.
-- The module/action catalogue lives in code (src/lib/access.ts); this file
-- only stores and enforces.
--
-- Additive: the 10 flags and nav_modules are untouched and still drive every
-- existing page. Requires 20261111b (my_report_ids, placement columns).

ALTER TABLE roles ADD COLUMN IF NOT EXISTS grants JSONB NOT NULL DEFAULT '{}'::jsonb;
-- Phase 3: which home-screen widgets this role lands on. NULL = whatever its grants allow.
ALTER TABLE roles ADD COLUMN IF NOT EXISTS home_widgets TEXT[];

-- Two-level merge: per module, b's actions win over a's.
CREATE OR REPLACE FUNCTION public.merge_grants(a JSONB, b JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(k, COALESCE(a -> k, '{}'::jsonb) || COALESCE(b -> k, '{}'::jsonb)), '{}'::jsonb)
  FROM (SELECT jsonb_object_keys(a) AS k UNION SELECT jsonb_object_keys(b)) keys;
$$;

-- Starting grants for a role, derived from the flags it already has, so no
-- one loses or gains anything on existing pages. Narrow grants first, wider
-- ones merged on top.
CREATE OR REPLACE FUNCTION public.legacy_grants(role_name TEXT, perms JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  g JSONB := '{"work": {"view": "assigned", "create": "own", "edit": "assigned"},
               "expenses": {"view": "own", "create": "own"},
               "tickets": {"view": "own", "create": "own"}}'::jsonb;
  on_flag CONSTANT JSONB := 'true'::jsonb;
BEGIN
  IF role_name = 'admin' THEN RETURN '{}'::jsonb; END IF;  -- admin is always organisation-wide
  IF perms -> 'manage_customers' = on_flag THEN
    g := merge_grants(g, '{"customers": {"view": "organisation", "create": "organisation", "edit": "organisation"},
                           "leads": {"view": "own", "create": "own", "edit": "own"},
                           "deals": {"view": "own", "create": "own", "edit": "own"},
                           "visits": {"view": "own", "create": "own", "edit": "own"}}');
  END IF;
  IF perms -> 'manage_orders' = on_flag THEN
    g := merge_grants(g, '{"orders": {"view": "organisation", "edit": "organisation"}}');
  END IF;
  IF perms -> 'can_delete' = on_flag THEN
    g := merge_grants(g, '{"customers": {"delete": "organisation"}, "orders": {"delete": "organisation"}}');
  END IF;
  IF perms -> 'can_import' = on_flag THEN
    g := merge_grants(g, '{"customers": {"export": "organisation"}, "orders": {"export": "organisation"}}');
  END IF;
  IF perms -> 'view_analytics' = on_flag THEN
    g := merge_grants(g, '{"reports": {"view": "organisation"}}');
  END IF;
  IF perms -> 'audit_tasks' = on_flag THEN
    g := merge_grants(g, '{"approvals": {"view": "team", "approve": "team"}, "work": {"view": "team", "approve": "team"}}');
  END IF;
  IF perms -> 'manage_automations' = on_flag THEN
    g := merge_grants(g, '{"workflows": {"view": "organisation", "manage": "organisation"}}');
  END IF;
  IF perms -> 'manage_workspaces' = on_flag OR perms -> 'manage_marketing' = on_flag THEN
    g := merge_grants(g, '{"work": {"view": "organisation", "assign": "organisation", "manage": "organisation"}}');
  END IF;
  IF perms -> 'manage_team' = on_flag THEN
    g := merge_grants(g, '{"team": {"view": "organisation", "manage": "organisation"},
                           "organisation": {"view": "organisation"},
                           "approvals": {"view": "team", "approve": "team"},
                           "expenses": {"view": "team", "approve": "team"},
                           "tickets": {"view": "organisation", "edit": "organisation", "assign": "organisation"},
                           "leads": {"view": "team", "edit": "team", "assign": "team"},
                           "deals": {"view": "team", "edit": "team", "assign": "team"},
                           "visits": {"view": "team"},
                           "vendors": {"view": "organisation"}, "invoices": {"view": "organisation"}}');
  END IF;
  IF role_name = 'accountant' THEN
    g := merge_grants(g, '{"expenses": {"view": "organisation", "approve": "organisation", "export": "organisation"},
                           "vendors": {"view": "organisation", "create": "organisation", "edit": "organisation"},
                           "invoices": {"view": "organisation", "create": "organisation", "edit": "organisation", "export": "organisation"},
                           "approvals": {"view": "organisation", "approve": "organisation"}}');
  END IF;
  IF role_name = 'hr' THEN
    g := merge_grants(g, '{"team": {"view": "organisation"}, "organisation": {"view": "organisation"}}');
  END IF;
  RETURN g;
END;
$$;

UPDATE roles SET grants = public.legacy_grants(name, permissions) WHERE grants = '{}'::jsonb AND name <> 'admin';

-- New roles (org seeding, or one made on the Roles page without a matrix)
-- start from the same derivation.
CREATE OR REPLACE FUNCTION public.trg_roles_default_grants_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.grants IS NULL OR NEW.grants = '{}'::jsonb THEN
    NEW.grants := public.legacy_grants(NEW.name, COALESCE(NEW.permissions, '{}'::jsonb));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_roles_default_grants ON roles;
CREATE TRIGGER trg_roles_default_grants BEFORE INSERT ON roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_roles_default_grants_fn();

-- The caller's scope for module.action, or NULL when not granted.
CREATE OR REPLACE FUNCTION public.perm_scope(module TEXT, action TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p.role = 'admin' THEN 'organisation'
              ELSE (SELECT r.grants -> module ->> action FROM roles r WHERE r.org_id = p.org_id AND r.name = p.role) END
  FROM profiles p JOIN organizations o ON o.id = p.org_id
  WHERE p.id = auth.uid() AND o.is_active AND p.is_active;
$$;

CREATE OR REPLACE FUNCTION public.has_perm(module TEXT, action TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.perm_scope(module, action) IS NOT NULL;
$$;

-- Does the caller's scope for module.action reach a record owned by
-- `owner`? Always pair with `org_id = current_org_id()` in the policy - this
-- only decides reach inside the org.
CREATE OR REPLACE FUNCTION public.can_reach(module TEXT, action TEXT, owner UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s  TEXT := public.perm_scope(module, action);
  me profiles%ROWTYPE;
  them profiles%ROWTYPE;
BEGIN
  IF s IS NULL THEN RETURN false; END IF;
  IF s = 'organisation' THEN RETURN true; END IF;
  IF owner IS NULL THEN RETURN false; END IF;
  IF owner = auth.uid() THEN RETURN true; END IF;
  IF s IN ('own', 'assigned') THEN RETURN false; END IF;
  IF s = 'team' THEN RETURN owner IN (SELECT public.my_report_ids()); END IF;
  SELECT * INTO me FROM profiles WHERE id = auth.uid();
  SELECT * INTO them FROM profiles WHERE id = owner AND org_id = me.org_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF s = 'department' THEN RETURN me.department_id IS NOT NULL AND them.department_id = me.department_id; END IF;
  IF s = 'branch' THEN RETURN me.branch_id IS NOT NULL AND them.branch_id = me.branch_id; END IF;
  RETURN false;  -- unknown scope value: deny
END;
$$;

REVOKE EXECUTE ON FUNCTION public.perm_scope(TEXT, TEXT), public.has_perm(TEXT, TEXT), public.can_reach(TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perm_scope(TEXT, TEXT), public.has_perm(TEXT, TEXT), public.can_reach(TEXT, TEXT, UUID) TO authenticated;

-- Organisation structure: besides admins, anyone granted organisation.manage.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches', 'departments', 'designations'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_perm_manage" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_perm_manage" ON %I FOR ALL TO authenticated USING (public.has_perm(''organisation'', ''manage'') AND org_id = public.current_org_id()) WITH CHECK (public.has_perm(''organisation'', ''manage'') AND org_id = public.current_org_id())', t, t);
  END LOOP;
END $$;
