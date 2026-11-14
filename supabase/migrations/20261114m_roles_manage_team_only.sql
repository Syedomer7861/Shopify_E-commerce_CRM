-- Privilege escalation fix: role definitions (roles.permissions / grants /
-- nav_modules) were writable by anyone passing is_workspace_admin(), which
-- includes the marketing role (manage_marketing = true). A marketer could edit
-- their own role's grants and give themselves any module.
--
-- The app only shows the Roles page to admins and manage_team holders
-- (Sidebar: permission "manage_team"). This makes the database match.
-- can_manage_team() mirrors hasPermission(profile, "manage_team") in
-- src/lib/permissions.ts: admin, else the per-user override, else the role
-- row's value, else the built-in default (true only for manager).

CREATE OR REPLACE FUNCTION public.can_manage_team()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.role = 'admin'
        OR COALESCE(
             (p.permissions ->> 'manage_team')::boolean,
             (r.permissions ->> 'manage_team')::boolean,
             p.role = 'manager')
    FROM public.profiles p
    LEFT JOIN public.roles r ON r.org_id = p.org_id AND r.name = p.role
    WHERE p.id = auth.uid()
  ), false);
$$;

REVOKE ALL ON FUNCTION public.can_manage_team() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_team() TO authenticated;

DROP POLICY IF EXISTS "roles_manage" ON public.roles;
CREATE POLICY "roles_manage" ON public.roles FOR ALL TO authenticated
  USING (public.can_manage_team() AND org_id = public.current_org_id())
  WITH CHECK (public.can_manage_team() AND org_id = public.current_org_id());
