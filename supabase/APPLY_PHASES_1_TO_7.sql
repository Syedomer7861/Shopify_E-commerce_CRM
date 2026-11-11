-- CodeCrest platform transformation, Phases 1-7 + reports fix, in dependency order.
-- For a database that has NOT had these yet. Safe to re-run.
-- (Production already has all of this as of 2026-11-11, applied via supabase db query --linked.)
BEGIN;

-- ============================================================
-- 20261111b_org_structure
-- ============================================================
-- Phase 1 of the platform plan (docs/PLATFORM_TRANSFORMATION_PLAN.md):
-- organisation structure. Until now department and designation were free
-- text on a profile and there was no branch or reporting line at all, so
-- nothing could be scoped to "my team" or "my department".
--
-- Additive only. profiles.department / profiles.designation (the text
-- columns) are left in place and still read by the HR screens; the new id
-- columns are backfilled from them.

CREATE TABLE IF NOT EXISTS branches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  name           VARCHAR(120) NOT NULL,
  code           VARCHAR(30),
  city           VARCHAR(120),
  state          VARCHAR(120),
  address        TEXT,
  is_head_office BOOLEAN NOT NULL DEFAULT false,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS departments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  name       VARCHAR(120) NOT NULL,
  parent_id  UUID REFERENCES departments(id) ON DELETE SET NULL,
  head_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE IF NOT EXISTS designations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  name          VARCHAR(120) NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  -- Role given by default to someone hired into this designation (a roles.name).
  default_role  VARCHAR(50),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_id      UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department_id  UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS designation_id UUID REFERENCES designations(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manager_id     UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_branches_org      ON branches(org_id);
CREATE INDEX IF NOT EXISTS idx_departments_org   ON departments(org_id);
CREATE INDEX IF NOT EXISTS idx_designations_org  ON designations(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_manager  ON profiles(manager_id);
CREATE INDEX IF NOT EXISTS idx_profiles_dept     ON profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_profiles_branch   ON profiles(branch_id);

-- Every member reads their own org's structure (needed for pickers and the
-- org chart); only admins change it. Phase 2 adds a permission-based
-- manage policy next to this one.
ALTER TABLE branches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches', 'departments', 'designations'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_read" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_read" ON %I FOR SELECT TO authenticated USING (org_id = public.current_org_id())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_admin_manage" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_admin_manage" ON %I FOR ALL TO authenticated USING (public.is_admin() AND org_id = public.current_org_id()) WITH CHECK (public.is_admin() AND org_id = public.current_org_id())', t, t);
  END LOOP;
END $$;

-- A profile's placement must point inside its own org, and a reporting
-- line can't loop back on itself. Checked for every writer, including
-- service-role scripts, because a cross-org manager_id would quietly put
-- one tenant's employee in another tenant's "team".
CREATE OR REPLACE FUNCTION public.validate_profile_placement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cursor_id UUID;
  hops      INT := 0;
BEGIN
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches WHERE id = NEW.branch_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'Branch does not belong to this organisation.';
  END IF;
  IF NEW.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM departments WHERE id = NEW.department_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'Department does not belong to this organisation.';
  END IF;
  IF NEW.designation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM designations WHERE id = NEW.designation_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'Designation does not belong to this organisation.';
  END IF;

  IF NEW.manager_id IS NOT NULL THEN
    IF NEW.manager_id = NEW.id THEN
      RAISE EXCEPTION 'An employee cannot report to themselves.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.manager_id AND org_id = NEW.org_id) THEN
      RAISE EXCEPTION 'Manager does not belong to this organisation.';
    END IF;
    cursor_id := NEW.manager_id;
    WHILE cursor_id IS NOT NULL AND hops < 50 LOOP
      SELECT manager_id INTO cursor_id FROM profiles WHERE id = cursor_id;
      IF cursor_id = NEW.id THEN
        RAISE EXCEPTION 'That reporting line would form a loop.';
      END IF;
      hops := hops + 1;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_profile_placement ON profiles;
CREATE TRIGGER trg_validate_profile_placement
  BEFORE INSERT OR UPDATE OF branch_id, department_id, designation_id, manager_id, org_id ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_placement();

-- profiles_self_update lets a user edit their own row (shift status etc.)
-- and RLS has no per-column control, so without this an employee could
-- move themselves under a different manager or department - which from
-- Phase 2 on decides whose records they can see. Separate trigger rather
-- than editing prevent_profile_self_escalation, so that one stays as is.
CREATE OR REPLACE FUNCTION public.protect_profile_placement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() OR public.has_role('hr') THEN
    RETURN NEW;
  END IF;
  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.department_id IS DISTINCT FROM OLD.department_id
     OR NEW.designation_id IS DISTINCT FROM OLD.designation_id
     OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
  THEN
    RAISE EXCEPTION 'Only admins or HR can change branch, department, designation or reporting manager.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_placement ON profiles;
CREATE TRIGGER trg_protect_profile_placement
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_placement();

-- Everyone below the caller in the reporting line, any depth. Phase 2's
-- "team" scope is built on this.
CREATE OR REPLACE FUNCTION public.my_report_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE reports AS (
    SELECT id, 1 AS depth FROM profiles WHERE manager_id = auth.uid()
    UNION ALL
    SELECT p.id, r.depth + 1 FROM profiles p JOIN reports r ON p.manager_id = r.id WHERE r.depth < 50
  )
  SELECT id FROM reports;
$$;
REVOKE EXECUTE ON FUNCTION public.my_report_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_report_ids() TO authenticated;

-- Backfill: one head-office branch per org, then a department/designation
-- row for each distinct text value already on a profile.
INSERT INTO branches (org_id, name, is_head_office)
SELECT o.id, 'Head Office', true FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.org_id = o.id);

INSERT INTO departments (org_id, name)
SELECT DISTINCT p.org_id, btrim(p.department) FROM profiles p
WHERE p.org_id IS NOT NULL AND btrim(COALESCE(p.department, '')) <> ''
ON CONFLICT (org_id, name) DO NOTHING;

INSERT INTO designations (org_id, name)
SELECT DISTINCT p.org_id, btrim(p.designation) FROM profiles p
WHERE p.org_id IS NOT NULL AND btrim(COALESCE(p.designation, '')) <> ''
ON CONFLICT (org_id, name) DO NOTHING;

UPDATE profiles p SET department_id = d.id FROM departments d
WHERE p.department_id IS NULL AND d.org_id = p.org_id AND d.name = btrim(p.department);

UPDATE profiles p SET designation_id = g.id FROM designations g
WHERE p.designation_id IS NULL AND g.org_id = p.org_id AND g.name = btrim(p.designation);

UPDATE profiles p SET branch_id = b.id FROM branches b
WHERE p.branch_id IS NULL AND b.org_id = p.org_id AND b.is_head_office;

-- New orgs get their head office automatically, like roles and settings.
CREATE OR REPLACE FUNCTION public.trg_seed_default_branch_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO branches (org_id, name, is_head_office) VALUES (NEW.id, 'Head Office', true)
  ON CONFLICT (org_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_seed_default_branch ON organizations;
CREATE TRIGGER trg_seed_default_branch
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_default_branch_fn();

-- ============================================================
-- 20261111c_permission_engine
-- ============================================================
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

-- ============================================================
-- 20261111d_approvals_and_task_review
-- ============================================================
-- Phase 4 of the platform plan: central tasks + approvals.
--
-- The Workspace engine (mkt_*) stays the one task system. This adds what it
-- lacked: a review gate, and a single approvals inbox shared by tasks,
-- expenses and (from Phase 5) workflow rules - instead of each module
-- growing its own approve/reject columns and screens.
--
-- Additive. Requires 20261111b and 20261111c.

ALTER TABLE mkt_tasks ADD COLUMN IF NOT EXISTS reviewer_id     UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE mkt_tasks ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20);
ALTER TABLE mkt_tasks ADD COLUMN IF NOT EXISTS department_id   UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE mkt_tasks ADD COLUMN IF NOT EXISTS escalated_at    TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  entity_type   VARCHAR(40) NOT NULL,          -- 'task' | 'expense' | 'request'
  entity_id     UUID,
  title         TEXT NOT NULL,
  detail        TEXT,
  amount        NUMERIC,
  requested_by  UUID REFERENCES profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  approver_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decision_note TEXT,
  decided_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  escalated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One open approval per record.
CREATE UNIQUE INDEX IF NOT EXISTS uq_approvals_open ON approvals(entity_type, entity_id) WHERE status = 'pending' AND entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approvals_approver ON approvals(approver_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approvals_requester ON approvals(requested_by);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id);

-- In-app notification that can never fail the business write that caused it.
CREATE OR REPLACE FUNCTION public.notify_user(target UUID, n_title TEXT, n_body TEXT, n_link TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF target IS NULL THEN RETURN; END IF;
  INSERT INTO notifications (org_id, user_id, title, body, link, type)
  SELECT p.org_id, p.id, n_title, n_body, n_link, 'info' FROM profiles p WHERE p.id = target;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_user failed: %', SQLERRM;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Fills in what the client must not be trusted with: whose request it is,
-- which org, and who approves (task reviewer, else the requester's manager).
CREATE OR REPLACE FUNCTION public.approvals_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t mkt_tasks%ROWTYPE;
  e expenses%ROWTYPE;
BEGIN
  NEW.status := 'pending';
  NEW.decided_by := NULL; NEW.decided_at := NULL; NEW.decision_note := NULL;

  IF NEW.entity_type = 'task' THEN
    SELECT * INTO t FROM mkt_tasks WHERE id = NEW.entity_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Task not found.'; END IF;
    NEW.requested_by := COALESCE(auth.uid(), NEW.requested_by, t.created_by);
    IF NOT (NEW.requested_by = ANY (t.assignees) OR NEW.requested_by = t.created_by) THEN
      RAISE EXCEPTION 'Only someone working on the task can send it for review.';
    END IF;
    NEW.org_id := t.org_id;
    NEW.approver_id := COALESCE(t.reviewer_id, NEW.approver_id);
  ELSIF NEW.entity_type = 'expense' THEN
    SELECT * INTO e FROM expenses WHERE id = NEW.entity_id;
    IF NOT FOUND OR lower(e.status) <> 'pending' THEN RAISE EXCEPTION 'Expense not found or already decided.'; END IF;
    NEW.requested_by := e.agent_id;
    NEW.org_id := e.org_id;
    NEW.amount := e.amount;
  ELSE
    NEW.requested_by := COALESCE(auth.uid(), NEW.requested_by);
  END IF;

  IF NEW.requested_by IS NULL THEN RAISE EXCEPTION 'An approval needs a requester.'; END IF;
  IF NEW.entity_type NOT IN ('task', 'expense') THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE id = NEW.requested_by;
  END IF;
  IF NEW.approver_id IS NULL OR NEW.approver_id = NEW.requested_by THEN
    SELECT manager_id INTO NEW.approver_id FROM profiles WHERE id = NEW.requested_by;
  END IF;
  IF NEW.approver_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.approver_id AND org_id = NEW.org_id AND is_active) THEN
    NEW.approver_id := NULL;  -- left for anyone holding approvals.approve
  END IF;
  RETURN NEW;
END;
$$;

-- A decision is final, is never the requester's own (admins excepted), and
-- nobody but an admin rewrites what was asked for.
CREATE OR REPLACE FUNCTION public.approvals_before_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF (NEW.entity_type, NEW.entity_id, NEW.title, NEW.amount, NEW.requested_by, NEW.org_id)
       IS DISTINCT FROM (OLD.entity_type, OLD.entity_id, OLD.title, OLD.amount, OLD.requested_by, OLD.org_id) THEN
      RAISE EXCEPTION 'An approval request cannot be rewritten.';
    END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'This request was already %.', OLD.status; END IF;
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      IF NEW.status = 'cancelled' AND auth.uid() <> OLD.requested_by THEN
        RAISE EXCEPTION 'Only the requester can cancel.';
      END IF;
      IF NEW.status IN ('approved', 'rejected') AND auth.uid() = OLD.requested_by THEN
        RAISE EXCEPTION 'You cannot decide your own request.';
      END IF;
    END IF;
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Carries the outcome back to the record and tells the people involved.
CREATE OR REPLACE FUNCTION public.approvals_after_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.entity_type = 'task' THEN
      UPDATE mkt_tasks SET approval_status = 'pending' WHERE id = NEW.entity_id;
    END IF;
    PERFORM public.notify_user(NEW.approver_id, 'Approval needed', NEW.title, '/approvals');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.entity_type = 'task' THEN
      UPDATE mkt_tasks SET approval_status = NULLIF(NEW.status, 'cancelled') WHERE id = NEW.entity_id;
    ELSIF NEW.entity_type = 'expense' AND NEW.status IN ('approved', 'rejected') THEN
      -- expenses.status is capitalised on this database ('Pending'/'Approved'/'Rejected', check-constrained).
      UPDATE expenses SET status = initcap(NEW.status) WHERE id = NEW.entity_id AND lower(status) = 'pending';
    END IF;
    IF NEW.status IN ('approved', 'rejected') THEN
      PERFORM public.notify_user(NEW.requested_by, 'Request ' || NEW.status, NEW.title, '/approvals');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_approvals_before_insert ON approvals;
CREATE TRIGGER trg_approvals_before_insert BEFORE INSERT ON approvals FOR EACH ROW EXECUTE FUNCTION public.approvals_before_insert();
DROP TRIGGER IF EXISTS trg_approvals_before_update ON approvals;
CREATE TRIGGER trg_approvals_before_update BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION public.approvals_before_update();
DROP TRIGGER IF EXISTS trg_approvals_after_write ON approvals;
CREATE TRIGGER trg_approvals_after_write AFTER INSERT OR UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION public.approvals_after_write();

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approvals_read ON approvals;
CREATE POLICY approvals_read ON approvals FOR SELECT TO authenticated USING (
  org_id = public.current_org_id()
  AND (requested_by = auth.uid() OR approver_id = auth.uid() OR public.can_reach('approvals', 'view', requested_by)));
DROP POLICY IF EXISTS approvals_request ON approvals;
CREATE POLICY approvals_request ON approvals FOR INSERT TO authenticated WITH CHECK (
  org_id = public.current_org_id());   -- requester/org/approver are set by approvals_before_insert
DROP POLICY IF EXISTS approvals_decide ON approvals;
CREATE POLICY approvals_decide ON approvals FOR UPDATE TO authenticated USING (
  org_id = public.current_org_id()
  AND (requested_by = auth.uid() OR approver_id = auth.uid() OR public.can_reach('approvals', 'approve', requested_by)))
  WITH CHECK (org_id = public.current_org_id());
DROP POLICY IF EXISTS approvals_admin_delete ON approvals;
CREATE POLICY approvals_admin_delete ON approvals FOR DELETE TO authenticated USING (public.is_admin() AND org_id = public.current_org_id());

-- Expenses: every pending claim opens an approval; a decision made the old
-- way (HR screen writing expenses.status) closes it so the inbox stays true.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url  TEXT;
-- So a claim filed from the browser lands in the filer's org without the client naming it.
ALTER TABLE expenses ALTER COLUMN org_id SET DEFAULT public.current_org_id();

CREATE OR REPLACE FUNCTION public.expenses_sync_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF lower(NEW.status) = 'pending' AND NEW.agent_id IS NOT NULL THEN
      INSERT INTO approvals (entity_type, entity_id, title, org_id, requested_by)
      VALUES ('expense', NEW.id, 'Expense: ' || COALESCE(NEW.category, 'claim') || ' - ' || COALESCE(NEW.amount, 0), NEW.org_id, NEW.agent_id)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND lower(OLD.status) = 'pending' THEN
    UPDATE approvals SET status = CASE WHEN lower(NEW.status) IN ('approved', 'rejected') THEN lower(NEW.status) ELSE 'cancelled' END
    WHERE entity_type = 'expense' AND entity_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_expenses_sync_approval ON expenses;
CREATE TRIGGER trg_expenses_sync_approval AFTER INSERT OR UPDATE OF status ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_sync_approval();

-- Permission-engine access to expenses, alongside whatever policies exist.
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expenses_perm_read ON expenses;
CREATE POLICY expenses_perm_read ON expenses FOR SELECT TO authenticated USING (
  org_id = public.current_org_id() AND public.can_reach('expenses', 'view', agent_id));
DROP POLICY IF EXISTS expenses_perm_create ON expenses;
CREATE POLICY expenses_perm_create ON expenses FOR INSERT TO authenticated WITH CHECK (
  org_id = public.current_org_id() AND agent_id = auth.uid() AND lower(status) = 'pending' AND public.has_perm('expenses', 'create'));

-- Claims that were already waiting before this migration get an approval too.
INSERT INTO approvals (entity_type, entity_id, title, org_id, requested_by)
SELECT 'expense', e.id, 'Expense: ' || COALESCE(e.category, 'claim') || ' - ' || COALESCE(e.amount, 0), e.org_id, e.agent_id
FROM expenses e WHERE lower(e.status) = 'pending' AND e.agent_id IS NOT NULL AND e.org_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Run from the scheduler (service role). Nudges up the reporting line:
-- approvals nobody touched for 2 days, tasks 2+ days overdue.
CREATE OR REPLACE FUNCTION public.run_work_escalations()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n INT := 0;
  a RECORD;
  t RECORD;
  boss UUID;
  who UUID;
BEGIN
  FOR a IN SELECT * FROM approvals WHERE status = 'pending' AND escalated_at IS NULL AND created_at < now() - INTERVAL '2 days' LOOP
    SELECT manager_id INTO boss FROM profiles WHERE id = COALESCE(a.approver_id, a.requested_by);
    PERFORM public.notify_user(boss, 'Approval waiting 2+ days', a.title, '/approvals');
    UPDATE approvals SET escalated_at = now() WHERE id = a.id;
    n := n + 1;
  END LOOP;
  FOR t IN SELECT * FROM mkt_tasks WHERE completed_at IS NULL AND escalated_at IS NULL AND due_date < CURRENT_DATE - 1 LOOP
    FOREACH who IN ARRAY COALESCE(t.assignees, '{}') LOOP
      SELECT manager_id INTO boss FROM profiles WHERE id = who;
      PERFORM public.notify_user(boss, 'Task overdue in your team', t.title, '/workspace');
    END LOOP;
    UPDATE mkt_tasks SET escalated_at = now() WHERE id = t.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.run_work_escalations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_work_escalations() TO service_role;

-- ============================================================
-- 20261111e_workflow_rules
-- ============================================================
-- Phase 5 of the platform plan: workflow rules.
--
-- `workflows` already drives customer messaging (order placed -> WhatsApp
-- steps). Rather than a second automation system, the same table now also
-- holds business rules: kind = 'rule', "when <event> and <conditions> then
-- <actions>". Messaging rows keep kind = 'messaging' and the messaging
-- engine never sees rule events (it matches on its own trigger names).
--
-- Flow: a row change emits a workflow_event -> process_workflow_events()
-- (run by the scheduler) matches rules, runs actions, logs a workflow_run.
-- Failures retry with backoff, then park as 'failed'. Plain SQL, no AI.
--
-- Additive. Requires 20261111b, c and d.

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS kind        VARCHAR(20) NOT NULL DEFAULT 'messaging';
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS version     INT NOT NULL DEFAULT 1;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS conditions  JSONB DEFAULT '[]'::jsonb;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS actions     JSONB DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_workflows_rules ON workflows(org_id, trigger_event) WHERE kind = 'rule';

CREATE TABLE IF NOT EXISTS workflow_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event           VARCHAR(60) NOT NULL,       -- e.g. 'expense.created', 'ticket.status_changed'
  entity_type     VARCHAR(40) NOT NULL,
  entity_id       UUID,
  owner_id        UUID,                        -- whose record it is; "owner"/"manager" in actions resolve from this
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workflow_events_due ON workflow_events(next_attempt_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS workflow_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  event_id    UUID REFERENCES workflow_events(id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL CHECK (status IN ('success', 'skipped', 'failed')),
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_wf ON workflow_runs(workflow_id, created_at DESC);

-- Read-only to people who can see workflows; only the engine writes.
ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_events_read ON workflow_events;
CREATE POLICY workflow_events_read ON workflow_events FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('workflows', 'view'));
DROP POLICY IF EXISTS workflow_runs_read ON workflow_runs;
CREATE POLICY workflow_runs_read ON workflow_runs FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('workflows', 'view'));

-- Attach to any table: CREATE TRIGGER ... EXECUTE FUNCTION emit_workflow_event('<entity>', '<owner column>').
-- Emits <entity>.created on insert and <entity>.status_changed when status
-- moves. Queues nothing unless the org has an active rule for that event,
-- and can never fail the write that fired it.
CREATE OR REPLACE FUNCTION public.emit_workflow_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_json JSONB := to_jsonb(NEW);
  ev TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    ev := TG_ARGV[0] || '.created';
  ELSIF row_json ->> 'status' IS DISTINCT FROM to_jsonb(OLD) ->> 'status' THEN
    ev := TG_ARGV[0] || '.status_changed';
  ELSE
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM workflows w WHERE w.org_id = (row_json ->> 'org_id')::uuid AND w.kind = 'rule' AND w.is_active AND w.trigger_event = ev) THEN
    INSERT INTO workflow_events (org_id, event, entity_type, entity_id, owner_id, payload)
    VALUES ((row_json ->> 'org_id')::uuid, ev, TG_ARGV[0], (row_json ->> 'id')::uuid, NULLIF(row_json ->> TG_ARGV[1], '')::uuid, row_json);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_workflow_event failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_emit_event ON expenses;
CREATE TRIGGER trg_expenses_emit_event AFTER INSERT OR UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.emit_workflow_event('expense', 'agent_id');
DROP TRIGGER IF EXISTS trg_approvals_emit_event ON approvals;
CREATE TRIGGER trg_approvals_emit_event AFTER INSERT OR UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION public.emit_workflow_event('approval', 'requested_by');

-- conditions: [{"field": "amount", "op": "gt", "value": 5000}, ...] - all must hold.
CREATE OR REPLACE FUNCTION public.rule_matches(conditions JSONB, payload JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  c JSONB;
  actual TEXT;
  wanted TEXT;
  ok BOOLEAN;
BEGIN
  IF conditions IS NULL OR jsonb_typeof(conditions) <> 'array' THEN RETURN true; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(conditions) LOOP
    actual := payload ->> (c ->> 'field');
    wanted := c ->> 'value';
    ok := CASE c ->> 'op'
      WHEN 'eq'       THEN actual IS NOT DISTINCT FROM wanted
      WHEN 'neq'      THEN actual IS DISTINCT FROM wanted
      WHEN 'contains' THEN actual ILIKE '%' || wanted || '%'
      WHEN 'gt'       THEN actual::numeric >  wanted::numeric
      WHEN 'gte'      THEN actual::numeric >= wanted::numeric
      WHEN 'lt'       THEN actual::numeric <  wanted::numeric
      WHEN 'lte'      THEN actual::numeric <= wanted::numeric
      ELSE false END;
    IF ok IS NOT TRUE THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;   -- e.g. a numeric comparison on a non-number: the rule does not match
END;
$$;

-- "owner" | "manager" | "role:<name>" | "user:<uuid>" -> people, always inside the org.
CREATE OR REPLACE FUNCTION public.rule_targets(spec TEXT, org UUID, owner UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM profiles p
  WHERE p.org_id = org AND p.is_active AND (
       (spec = 'owner'   AND p.id = owner)
    OR (spec = 'manager' AND p.id = (SELECT manager_id FROM profiles WHERE id = owner))
    OR (spec LIKE 'role:%' AND p.role = substr(spec, 6))
    OR (spec LIKE 'user:%' AND p.id::text = substr(spec, 6)));
$$;

-- "Expense of {{amount}} filed" -> values from the event payload.
CREATE OR REPLACE FUNCTION public.rule_text(template TEXT, payload JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k TEXT;
  out_text TEXT := COALESCE(template, '');
BEGIN
  FOR k IN SELECT jsonb_object_keys(payload) LOOP
    out_text := replace(out_text, '{{' || k || '}}', COALESCE(payload ->> k, ''));
  END LOOP;
  RETURN out_text;
END;
$$;

-- actions: [{"type": "notify", "to": "manager", "title": "...", "body": "...", "link": "/..."},
--           {"type": "create_approval", "title": "...", "approver": "manager" | "user:<uuid>"}]
CREATE OR REPLACE FUNCTION public.process_workflow_events(batch INT DEFAULT 50)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev workflow_events%ROWTYPE;
  wf workflows%ROWTYPE;
  act JSONB;
  target UUID;
  handled INT := 0;
BEGIN
  FOR ev IN SELECT * FROM workflow_events WHERE status = 'pending' AND next_attempt_at <= now()
            ORDER BY created_at LIMIT batch FOR UPDATE SKIP LOCKED LOOP
    BEGIN
      FOR wf IN SELECT * FROM workflows WHERE org_id = ev.org_id AND kind = 'rule' AND is_active AND trigger_event = ev.event LOOP
        IF NOT public.rule_matches(wf.conditions, ev.payload) THEN
          INSERT INTO workflow_runs (org_id, workflow_id, event_id, status, detail) VALUES (ev.org_id, wf.id, ev.id, 'skipped', 'conditions not met');
          CONTINUE;
        END IF;
        FOR act IN SELECT * FROM jsonb_array_elements(COALESCE(wf.actions, '[]'::jsonb)) LOOP
          IF act ->> 'type' = 'notify' THEN
            FOR target IN SELECT public.rule_targets(act ->> 'to', ev.org_id, ev.owner_id) LOOP
              PERFORM public.notify_user(target, public.rule_text(act ->> 'title', ev.payload), public.rule_text(act ->> 'body', ev.payload), act ->> 'link');
            END LOOP;
          ELSIF act ->> 'type' = 'create_approval' THEN
            IF ev.owner_id IS NULL THEN RAISE EXCEPTION 'create_approval needs a record owner'; END IF;
            INSERT INTO approvals (entity_type, title, detail, requested_by, approver_id, org_id)
            VALUES ('request', public.rule_text(act ->> 'title', ev.payload), 'Raised by rule: ' || wf.name, ev.owner_id,
                    (SELECT public.rule_targets(COALESCE(act ->> 'approver', 'manager'), ev.org_id, ev.owner_id) LIMIT 1), ev.org_id);
          ELSE
            RAISE EXCEPTION 'unknown action type: %', act ->> 'type';
          END IF;
        END LOOP;
        INSERT INTO workflow_runs (org_id, workflow_id, event_id, status) VALUES (ev.org_id, wf.id, ev.id, 'success');
      END LOOP;
      UPDATE workflow_events SET status = 'done', processed_at = now() WHERE id = ev.id;
    EXCEPTION WHEN OTHERS THEN
      -- Everything this event did is rolled back; retry in 2, 4, 8, 16 min, then give up.
      UPDATE workflow_events SET attempts = attempts + 1, last_error = SQLERRM,
             status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
             next_attempt_at = now() + make_interval(mins => (2 ^ (attempts + 1))::int)
      WHERE id = ev.id;
      INSERT INTO workflow_runs (org_id, workflow_id, event_id, status, detail) VALUES (ev.org_id, wf.id, ev.id, 'failed', SQLERRM);
    END;
    handled := handled + 1;
  END LOOP;
  RETURN handled;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_workflow_events(INT), public.rule_targets(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_workflow_events(INT) TO service_role;

-- The existing workflows policy lets any member of the org write any row.
-- That stays as it is for messaging workflows, but a rule can notify people
-- and raise approvals, so rule rows additionally need the workflows grants.
-- RESTRICTIVE = narrows the existing policy for kind = 'rule' only.
DROP POLICY IF EXISTS workflows_rules_read ON workflows;
CREATE POLICY workflows_rules_read ON workflows AS RESTRICTIVE FOR SELECT TO authenticated
  USING (kind <> 'rule' OR public.has_perm('workflows', 'view'));
DROP POLICY IF EXISTS workflows_rules_insert ON workflows;
CREATE POLICY workflows_rules_insert ON workflows AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (kind <> 'rule' OR public.has_perm('workflows', 'manage'));
DROP POLICY IF EXISTS workflows_rules_update ON workflows;
CREATE POLICY workflows_rules_update ON workflows AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (kind <> 'rule' OR public.has_perm('workflows', 'manage'))
  WITH CHECK (kind <> 'rule' OR public.has_perm('workflows', 'manage'));
DROP POLICY IF EXISTS workflows_rules_delete ON workflows;
CREATE POLICY workflows_rules_delete ON workflows AS RESTRICTIVE FOR DELETE TO authenticated
  USING (kind <> 'rule' OR public.has_perm('workflows', 'manage'));

-- ============================================================
-- 20261111f_business_modules
-- ============================================================
-- Phase 6 of the platform plan: the new business modules.
--   Finance      - vendors, invoices (expenses already exist; Phase 4 wired them)
--   Service Desk - tickets with SLA clocks
--   Sales        - leads, deals
--   Field Force  - territories, visits (location only with the employee's consent)
--
-- Every table is org-scoped and every policy goes through the permission
-- engine (can_reach / has_perm from 20261111c), so who sees what is set on
-- the Roles page, not here. Nothing here touches customers, orders, the
-- call queue, Shopify, WhatsApp or shipping.
--
-- Additive. Requires 20261111b, c, d and e.

CREATE TABLE IF NOT EXISTS vendors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  name         VARCHAR(160) NOT NULL,
  contact_name VARCHAR(160),
  phone        VARCHAR(30),
  email        VARCHAR(160),
  tax_id       VARCHAR(40),
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS invoices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  number      VARCHAR(60) NOT NULL,
  direction   VARCHAR(12) NOT NULL DEFAULT 'payable' CHECK (direction IN ('payable', 'receivable')),
  vendor_id   UUID REFERENCES vendors(id) ON DELETE SET NULL,
  party_name  VARCHAR(160),
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  issue_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date    DATE,
  status      VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  notes       TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, direction, number)
);

CREATE TABLE IF NOT EXISTS tickets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  subject        VARCHAR(200) NOT NULL,
  description    TEXT,
  category       VARCHAR(60),
  priority       VARCHAR(12) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status         VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  requester_id   UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  assignee_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sla_due_at     TIMESTAMPTZ,
  sla_breached_at TIMESTAMPTZ,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  name       VARCHAR(160) NOT NULL,
  phone      VARCHAR(30),
  email      VARCHAR(160),
  company    VARCHAR(160),
  source     VARCHAR(60),
  status     VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  est_value  NUMERIC(14, 2),
  notes      TEXT,
  owner_id   UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  title          VARCHAR(200) NOT NULL,
  lead_id        UUID REFERENCES leads(id) ON DELETE SET NULL,
  value          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status         VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'proposal', 'negotiation', 'won', 'lost')),
  expected_close DATE,
  notes          TEXT,
  owner_id       UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS territories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  name       VARCHAR(120) NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS visits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  party_name       VARCHAR(160) NOT NULL,
  purpose          TEXT,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  territory_id     UUID REFERENCES territories(id) ON DELETE SET NULL,
  planned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'checked_in', 'completed', 'cancelled')),
  check_in_at      TIMESTAMPTZ,
  check_out_at     TIMESTAMPTZ,
  -- Coordinates are stored only when the employee agreed to share location for this check-in.
  location_consent BOOLEAN NOT NULL DEFAULT false,
  check_in_lat     NUMERIC(9, 6),
  check_in_lng     NUMERIC(9, 6),
  outcome          TEXT,
  owner_id         UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT visits_location_needs_consent CHECK (location_consent OR (check_in_lat IS NULL AND check_in_lng IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_vendors_org     ON vendors(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org    ON invoices(org_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_org     ON tickets(org_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_leads_org       ON leads(org_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_owner     ON leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_org       ON deals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_visits_owner    ON visits(owner_id, planned_at);

-- Any person a row names (owner, assignee...) must be in the row's org.
-- Usage: EXECUTE FUNCTION people_in_org('owner_id', 'assignee_id').
CREATE OR REPLACE FUNCTION public.people_in_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_json JSONB := to_jsonb(NEW);
  col TEXT;
  person UUID;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    person := NULLIF(row_json ->> col, '')::uuid;
    IF person IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = person AND org_id = NEW.org_id) THEN
      RAISE EXCEPTION '% must be someone in this organisation.', col;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- Standard permission-engine policies for a table with one owner column.
DO $$
DECLARE
  spec TEXT[];
  t TEXT; m TEXT; o TEXT;
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ['vendors',  'vendors',  'created_by'],
    ['invoices', 'invoices', 'created_by'],
    ['leads',    'leads',    'owner_id'],
    ['deals',    'deals',    'owner_id'],
    ['visits',   'visits',   'owner_id']
  ] LOOP
    t := spec[1]; m := spec[2]; o := spec[3];
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND public.can_reach(%L, ''view'', %I))', t || '_read', t, m, o);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_create', t);
    -- Create for yourself; creating for someone else needs the assign action over them.
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (org_id = public.current_org_id() AND public.has_perm(%L, ''create'') AND (%I = auth.uid() OR public.can_reach(%L, ''assign'', %I)))', t || '_create', t, m, o, m, o);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_edit', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (org_id = public.current_org_id() AND public.can_reach(%L, ''edit'', %I)) WITH CHECK (org_id = public.current_org_id() AND (public.can_reach(%L, ''edit'', %I) OR public.can_reach(%L, ''assign'', %I)))', t || '_edit', t, m, o, m, o, m, o);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (org_id = public.current_org_id() AND public.can_reach(%L, ''delete'', %I))', t || '_delete', t, m, o);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_people', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.people_in_org(%L)', 'trg_' || t || '_people', t, o);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_emit_event', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.emit_workflow_event(%L, %L)', 'trg_' || t || '_emit_event', t, rtrim(t, 's'), o);
  END LOOP;
END $$;

-- Tickets: the requester and the assignee always see their ticket; the
-- assignee can work it; wider reach comes from the tickets grants.
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tickets_read ON tickets;
CREATE POLICY tickets_read ON tickets FOR SELECT TO authenticated USING (
  org_id = public.current_org_id()
  AND (requester_id = auth.uid() OR assignee_id = auth.uid() OR public.can_reach('tickets', 'view', requester_id)));
DROP POLICY IF EXISTS tickets_create ON tickets;
CREATE POLICY tickets_create ON tickets FOR INSERT TO authenticated WITH CHECK (
  org_id = public.current_org_id() AND requester_id = auth.uid() AND public.has_perm('tickets', 'create')
  AND (assignee_id IS NULL OR public.has_perm('tickets', 'assign')));
DROP POLICY IF EXISTS tickets_edit ON tickets;
CREATE POLICY tickets_edit ON tickets FOR UPDATE TO authenticated USING (
  org_id = public.current_org_id() AND (assignee_id = auth.uid() OR public.can_reach('tickets', 'edit', requester_id)))
  WITH CHECK (org_id = public.current_org_id());
DROP POLICY IF EXISTS tickets_delete ON tickets;
CREATE POLICY tickets_delete ON tickets FOR DELETE TO authenticated USING (
  org_id = public.current_org_id() AND public.has_perm('tickets', 'manage'));

-- SLA clock: urgent 4h, high 8h, normal 24h, low 72h from creation.
-- Only someone with tickets.assign may hand a ticket to another person.
CREATE OR REPLACE FUNCTION public.tickets_before_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.priority IS DISTINCT FROM OLD.priority THEN
    NEW.sla_due_at := NEW.created_at + CASE NEW.priority
      WHEN 'urgent' THEN INTERVAL '4 hours' WHEN 'high' THEN INTERVAL '8 hours'
      WHEN 'low' THEN INTERVAL '72 hours' ELSE INTERVAL '24 hours' END;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       AND NOT public.has_perm('tickets', 'assign') THEN
      RAISE EXCEPTION 'You are not allowed to reassign tickets.';
    END IF;
    IF NEW.status IN ('resolved', 'closed') AND OLD.status NOT IN ('resolved', 'closed') THEN
      NEW.resolved_at := now();
    ELSIF NEW.status NOT IN ('resolved', 'closed') THEN
      NEW.resolved_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tickets_before_write ON tickets;
CREATE TRIGGER trg_tickets_before_write BEFORE INSERT OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION public.tickets_before_write();
DROP TRIGGER IF EXISTS trg_tickets_people ON tickets;
CREATE TRIGGER trg_tickets_people BEFORE INSERT OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION public.people_in_org('requester_id', 'assignee_id');
DROP TRIGGER IF EXISTS trg_tickets_emit_event ON tickets;
CREATE TRIGGER trg_tickets_emit_event AFTER INSERT OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION public.emit_workflow_event('ticket', 'requester_id');

-- Territories: everyone in the org reads them; team managers maintain them.
ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS territories_read ON territories;
CREATE POLICY territories_read ON territories FOR SELECT TO authenticated USING (org_id = public.current_org_id());
DROP POLICY IF EXISTS territories_manage ON territories;
CREATE POLICY territories_manage ON territories FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('team', 'manage'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_perm('team', 'manage'));

-- Scheduler job (service role): flag tickets past their SLA once, tell the
-- assignee's manager (or the requester's, if unassigned), mark overdue invoices.
CREATE OR REPLACE FUNCTION public.run_sla_checks()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t tickets%ROWTYPE;
  boss UUID;
  n INT := 0;
BEGIN
  FOR t IN SELECT * FROM tickets WHERE status NOT IN ('resolved', 'closed') AND sla_breached_at IS NULL AND sla_due_at < now() LOOP
    SELECT manager_id INTO boss FROM profiles WHERE id = COALESCE(t.assignee_id, t.requester_id);
    PERFORM public.notify_user(boss, 'Ticket past SLA', t.subject, '/service-desk');
    PERFORM public.notify_user(t.assignee_id, 'Your ticket is past SLA', t.subject, '/service-desk');
    UPDATE tickets SET sla_breached_at = now() WHERE id = t.id;
    n := n + 1;
  END LOOP;
  UPDATE invoices SET status = 'overdue' WHERE status = 'sent' AND due_date < CURRENT_DATE;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.run_sla_checks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_sla_checks() TO service_role;

-- ============================================================
-- 20261111g_enterprise_controls
-- ============================================================
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

-- ============================================================
-- 20261111h_fix_reports_state_distribution
-- ============================================================
-- Fix: the Analytics "orders by state" report returned HTTP 500 on every
-- load ("column o.payment_gateway does not exist"). The function was written
-- against an orders.payment_gateway column this database does not have, and
-- Postgres resolves the column even when the payment filter is "all", so the
-- whole report failed and the page fell back to a slow client-side aggregate.
--
-- Read the value through to_jsonb(o) instead: identical result where the
-- column exists, NULL (so a COD/Prepaid filter matches nothing) where it
-- does not. Everything else is unchanged from 20260902a.

CREATE OR REPLACE FUNCTION reports_state_distribution(
  p_start   date,
  p_end     date,
  p_state   text DEFAULT 'all',
  p_segment text DEFAULT 'all',
  p_payment text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_use_rollup boolean;
  v_result     jsonb;
BEGIN
  -- Rollup only carries state + orders + revenue (no segment / payment
  -- dimension), so it can serve the common unfiltered case; anything with a
  -- segment or payment filter falls to a live aggregate. Both paths return
  -- the same shape and at most 12 rows.
  v_use_rollup := (p_segment = 'all' AND p_payment = 'all')
                  AND EXISTS (SELECT 1 FROM rollup_daily_state_orders LIMIT 1);

  IF v_use_rollup THEN
    WITH agg AS (
      SELECT r.state,
             sum(r.orders)::bigint  AS orders,
             sum(r.revenue)::numeric AS revenue
      FROM rollup_daily_state_orders r
      WHERE r.day >= p_start
        AND r.day <= p_end
        AND (p_state = 'all' OR r.state = initcap(btrim(p_state)))
      GROUP BY r.state
    )
    SELECT jsonb_build_object(
      'source', 'rollup',
      'total_revenue', coalesce((SELECT sum(revenue) FROM agg), 0),
      'rows', coalesce((
        SELECT jsonb_agg(x ORDER BY x.revenue DESC)
        FROM (SELECT state, orders, revenue FROM agg ORDER BY revenue DESC LIMIT 12) x
      ), '[]'::jsonb)
    ) INTO v_result;
  ELSE
    WITH agg AS (
      SELECT initcap(btrim(c.state))  AS state,
             count(*)::bigint         AS orders,
             coalesce(sum(o.total_price), 0)::numeric AS revenue
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE (o.ordered_at AT TIME ZONE 'Asia/Kolkata')::date >= p_start
        AND (o.ordered_at AT TIME ZONE 'Asia/Kolkata')::date <= p_end
        AND btrim(coalesce(c.state, '')) <> ''
        AND (p_state   = 'all' OR c.state = p_state)
        AND (p_segment = 'all' OR c.segment = p_segment)
        AND (p_payment = 'all' OR to_jsonb(o) ->> 'payment_gateway' =
              CASE WHEN p_payment = 'COD' THEN 'Cash on Delivery (COD)' ELSE 'Prepaid' END)
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'source', 'live',
      'total_revenue', coalesce((SELECT sum(revenue) FROM agg), 0),
      'rows', coalesce((
        SELECT jsonb_agg(x ORDER BY x.revenue DESC)
        FROM (SELECT state, orders, revenue FROM agg ORDER BY revenue DESC LIMIT 12) x
      ), '[]'::jsonb)
    ) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL     ON FUNCTION reports_state_distribution(date, date, text, text, text) FROM public;
GRANT  EXECUTE ON FUNCTION reports_state_distribution(date, date, text, text, text) TO authenticated;

COMMIT;
