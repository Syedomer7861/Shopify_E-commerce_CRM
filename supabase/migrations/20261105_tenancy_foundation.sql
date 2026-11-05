-- Phase 0: multi-tenant foundation.
-- Adds organizations + profiles.org_id + current_org_id() RLS helper.
-- Scope is deliberately narrow: no other table gets org_id yet, no RLS
-- policy besides profiles' own is touched. That retrofit is Phase 1 and
-- needs its own full permission re-test before it ships.

CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  slug       VARCHAR(100) NOT NULL UNIQUE,
  plan       VARCHAR(20) NOT NULL DEFAULT 'free',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Seed org for all data that already exists.
INSERT INTO organizations (name, slug)
VALUES ('CureForever', 'cureforever')
ON CONFLICT (slug) DO NOTHING;

-- profiles.org_id, defaulted to the seed org so existing signup/employee-
-- creation code (handle_new_user trigger, admin.ts upsert) keeps working
-- unchanged. Explicit org_id passed later (Phase 6 signup) overrides it.
-- Postgres column DEFAULT can't hold a bare subquery, so wrap the lookup.
CREATE OR REPLACE FUNCTION public.default_org_id()
RETURNS uuid AS $$
  SELECT id FROM public.organizations WHERE slug = 'cureforever';
$$ LANGUAGE sql STABLE;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

UPDATE profiles SET org_id = public.default_org_id()
WHERE org_id IS NULL;

ALTER TABLE profiles
  ALTER COLUMN org_id SET DEFAULT public.default_org_id(),
  ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON profiles(org_id);

-- Mirrors public.is_admin()'s recursion-safe pattern.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Members can read their own org; only admins can edit it.
CREATE POLICY "organizations_read_own" ON organizations
FOR SELECT TO authenticated
USING (id = public.current_org_id());

CREATE POLICY "organizations_admin_manage" ON organizations
FOR ALL TO authenticated
USING (public.is_admin() AND id = public.current_org_id());

-- Carry org_id onto new profiles automatically (signup trigger).
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
