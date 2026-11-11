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
