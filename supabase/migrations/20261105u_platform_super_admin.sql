-- Phase 6 leftover: platform super-admin. Distinct from an org's own
-- `admin` role — org admins are scoped to their own org everywhere
-- (current_org_id()). A platform admin is the SaaS owner and needs to see
-- every org to support them, which no existing role/RLS grants.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

-- Mirrors is_admin()'s recursion-safe SECURITY DEFINER pattern.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- Adds platform-admin access on top of the existing org-scoped policy
-- (organizations_admin_manage) — doesn't touch or widen it. is_platform_admin()
-- returns false for every ordinary org admin, so this grants nothing extra
-- to them; Postgres ORs permissive policies, so this is purely additive.
DROP POLICY IF EXISTS "platform_admin_manage_orgs" ON organizations;
CREATE POLICY "platform_admin_manage_orgs" ON organizations FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Aggregated, non-PII cross-org stats for the platform dashboard — a
-- function instead of a broad SELECT policy on `profiles`, so platform
-- admin access doesn't widen the RLS surface on a table that has already
-- had real cross-tenant leaks this session (see 20261105o/r). Filtering
-- in the WHERE clause (rather than an early RETURN) means a non-platform-
-- admin caller just gets zero rows back, never an error that leaks whether
-- the function exists.
CREATE OR REPLACE FUNCTION public.platform_admin_org_stats()
RETURNS TABLE (
  org_id UUID, name VARCHAR, slug VARCHAR, plan VARCHAR,
  is_active BOOLEAN, member_count BIGINT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.id, o.name, o.slug, o.plan, o.is_active,
    (SELECT count(*) FROM public.profiles p WHERE p.org_id = o.id),
    o.created_at
  FROM public.organizations o
  WHERE public.is_platform_admin()
  ORDER BY o.created_at;
$$;
REVOKE EXECUTE ON FUNCTION public.platform_admin_org_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_admin_org_stats() TO authenticated;

-- Make org suspension (organizations.is_active = false) actually enforced
-- instead of cosmetic: current_org_id() is the one helper nearly every RLS
-- policy in the schema calls as `org_id = public.current_org_id()`, so
-- returning NULL for a suspended org's members locks out every table in
-- one place instead of touching ~80 policies individually. A NULL org_id
-- never equals a real org_id, so access simply stops; no policy elsewhere
-- needs to change. Known gap: the app itself has no "your organization has
-- been suspended" screen yet, so a suspended org's users see the dashboard
-- fail to load data rather than a clear message — follow-up, not a
-- security issue (no data leak, just an unfriendly lockout).
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.org_id FROM public.profiles p
  JOIN public.organizations o ON o.id = p.org_id
  WHERE p.id = auth.uid() AND o.is_active;
$$;

-- Set the SaaS owner as platform admin. Scoped to one explicit email so
-- this can't accidentally grant the flag to anyone else on re-run.
UPDATE profiles SET is_platform_admin = true WHERE email = 'farrukhmehdi10@gmail.com';
