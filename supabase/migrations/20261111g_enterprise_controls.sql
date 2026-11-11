-- Phase 7 of the platform plan: admin and enterprise controls.
--   - per-organisation module switches (enforced in the permission engine,
--     so a switched-off module is closed in the database, not just hidden)
--   - idle session timeout setting
--   - an audit trail for the new structure, permission and business tables
--
-- Additive. Requires 20261111b through f.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS disabled_modules        TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS session_timeout_minutes INT CHECK (session_timeout_minutes IS NULL OR session_timeout_minutes BETWEEN 5 AND 1440);

-- Org admins change only these two things about their organisation - never
-- plan or is_active, which is why this is a function and not an UPDATE policy.
CREATE OR REPLACE FUNCTION public.set_org_controls(modules_off TEXT[], timeout_minutes INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() OR public.current_org_id() IS NULL THEN
    RAISE EXCEPTION 'Only an organisation admin can change these controls.';
  END IF;
  UPDATE organizations
  SET disabled_modules = COALESCE(modules_off, '{}'), session_timeout_minutes = timeout_minutes
  WHERE id = public.current_org_id();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_org_controls(TEXT[], INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_org_controls(TEXT[], INT) TO authenticated;

-- What the app needs to know about the caller's org, without widening who can read `organizations`.
CREATE OR REPLACE FUNCTION public.my_org_controls()
RETURNS TABLE (disabled_modules TEXT[], session_timeout_minutes INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.disabled_modules, o.session_timeout_minutes FROM organizations o WHERE o.id = public.current_org_id();
$$;
REVOKE EXECUTE ON FUNCTION public.my_org_controls() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_org_controls() TO authenticated;

-- perm_scope, now aware of switched-off modules: nobody, admin included,
-- holds a permission in a module the organisation has turned off.
CREATE OR REPLACE FUNCTION public.perm_scope(module TEXT, action TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN module = ANY (o.disabled_modules) THEN NULL
              WHEN p.role = 'admin' THEN 'organisation'
              ELSE (SELECT r.grants -> module ->> action FROM roles r WHERE r.org_id = p.org_id AND r.name = p.role) END
  FROM profiles p JOIN organizations o ON o.id = p.org_id
  WHERE p.id = auth.uid() AND o.is_active AND p.is_active;
$$;

-- Audit trail. One row per insert/update/delete on the tables below, into
-- the existing audit_logs table (the Alert Logs page already reads it).
-- Never fails the write it records.
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_json JSONB := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  what TEXT := COALESCE(row_json ->> 'name', row_json ->> 'title', row_json ->> 'subject', row_json ->> 'number', row_json ->> 'party_name', '');
BEGIN
  INSERT INTO audit_logs (org_id, actor_id, entity_type, entity_id, action, summary, metadata)
  VALUES (COALESCE((row_json ->> 'org_id')::uuid, public.current_org_id()), auth.uid(), TG_TABLE_NAME, (row_json ->> 'id')::uuid,
          TG_TABLE_NAME || '_' || lower(TG_OP), initcap(TG_OP) || ' ' || TG_TABLE_NAME || ' ' || what,
          CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)) ELSE row_json END);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'audit_row_change failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles', 'branches', 'departments', 'designations', 'approvals', 'expenses',
                           'vendors', 'invoices', 'tickets', 'leads', 'deals', 'visits'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', 'trg_audit_' || t, t);
  END LOOP;
END $$;

-- Who moved whom: placement and role changes on a profile.
CREATE OR REPLACE FUNCTION public.audit_profile_placement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_logs (org_id, actor_id, entity_type, entity_id, action, summary, metadata)
  VALUES (NEW.org_id, auth.uid(), 'profiles', NEW.id, 'profile_placement_changed', 'Changed role or placement of ' || COALESCE(NEW.name, 'a member'),
          jsonb_build_object(
            'before', jsonb_build_object('role', OLD.role, 'manager_id', OLD.manager_id, 'department_id', OLD.department_id, 'branch_id', OLD.branch_id, 'designation_id', OLD.designation_id),
            'after',  jsonb_build_object('role', NEW.role, 'manager_id', NEW.manager_id, 'department_id', NEW.department_id, 'branch_id', NEW.branch_id, 'designation_id', NEW.designation_id)));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'audit_profile_placement failed: %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_profile_placement ON profiles;
CREATE TRIGGER trg_audit_profile_placement
  AFTER UPDATE OF role, manager_id, department_id, branch_id, designation_id ON profiles
  FOR EACH ROW WHEN ((OLD.role, OLD.manager_id, OLD.department_id, OLD.branch_id, OLD.designation_id)
                     IS DISTINCT FROM (NEW.role, NEW.manager_id, NEW.department_id, NEW.branch_id, NEW.designation_id))
  EXECUTE FUNCTION public.audit_profile_placement();

-- Let holders of audit.view read their org's trail, next to existing policies.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_perm_read ON audit_logs;
CREATE POLICY audit_logs_perm_read ON audit_logs FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('audit', 'view'));

-- audit_logs already carries an org-wide policy (any member reads every
-- audit row in their org; older screens such as task history depend on it).
-- The rows written by audit_row_change() contain whole records, so left
-- alone a peer could read someone else's lead, ticket or claim through the
-- audit log. Narrow just those rows to the actor and audit.view holders;
-- every older kind of audit row is untouched.
DROP POLICY IF EXISTS audit_logs_engine_rows ON audit_logs;
CREATE POLICY audit_logs_engine_rows ON audit_logs AS RESTRICTIVE FOR SELECT TO authenticated USING (
  (COALESCE(entity_type, '') NOT IN ('roles', 'branches', 'departments', 'designations', 'approvals', 'expenses',
                                     'vendors', 'invoices', 'tickets', 'leads', 'deals', 'visits')
   AND COALESCE(action, '') <> 'profile_placement_changed')
  OR actor_id = auth.uid()
  OR public.has_perm('audit', 'view'));
