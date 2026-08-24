-- CRITICAL: profiles_self_update (20260413_phase4_ecosystem.sql) allows any
-- authenticated user to UPDATE any column on their own profiles row - it
-- only checks auth.uid() = id, with no column restriction. Comment said
-- "Self-Update for Status/Shift" but Postgres RLS has no column-level
-- granularity, so this let ANY agent/hr/manager run
--   supabase.from("profiles").update({ role: "admin", permissions: {...} }).eq("id", myOwnId)
-- from the browser console and self-promote to full admin. RLS policies are
-- OR'd, so the separate admin-only policy doesn't block this - having one
-- matching permissive policy is enough for Postgres to allow it.
--
-- While auditing this, also found EmployeeDirectory.tsx's offboarding
-- toggle (updates is_active on OTHER employees' rows via /api/hr/data,
-- under the acting HR user's own session) has never had a matching RLS
-- policy at all - profiles only allows admin-manage-all or self-update.
-- For a non-admin HR user acting on someone else's row, that update
-- silently affects 0 rows (no RLS error, just nothing happens) while the
-- UI reports success. Fixing both together since they're the same
-- profiles-UPDATE security model.
--
-- Fix: a real HR-scoped UPDATE policy (non-admin rows only, matching the
-- existing "HR shouldn't see Admins" convention already in team/page.tsx),
-- plus a trigger that blocks changes to sensitive columns (role,
-- permissions, is_demo, specialization) unless the actor is already an
-- admin - checked via public.is_admin()/has_role(), which read the CALLING
-- user's own role, not the row being edited. is_active is the one exception
-- HR legitimately needs for onboarding/offboarding. Everything else
-- (notice_period, department, salary, designation, etc.) passes through
-- under whichever base policy already permitted touching the row.

DROP POLICY IF EXISTS "hr_manage_employee_profiles" ON profiles;
CREATE POLICY "hr_manage_employee_profiles" ON profiles
FOR UPDATE TO authenticated
USING (public.has_role('hr') AND role <> 'admin')
WITH CHECK (public.has_role('hr') AND role <> 'admin');

CREATE OR REPLACE FUNCTION public.prevent_profile_self_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Service-role/background connections (crons, server actions using
  -- SUPABASE_SERVICE_ROLE_KEY) carry no end-user JWT, so auth.uid() is
  -- null here - same "trusted by design, enforced at the app layer" model
  -- this codebase already uses for requireInternal()/hasInternalSecret().
  -- Only browser-originated writes (a real user's own JWT) get checked.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NOT public.has_role('hr') THEN
    RAISE EXCEPTION 'Only admins or HR can change active status.';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.is_demo IS DISTINCT FROM OLD.is_demo
     OR NEW.assigned_segments IS DISTINCT FROM OLD.assigned_segments
     OR NEW.assigned_task_types IS DISTINCT FROM OLD.assigned_task_types
  THEN
    RAISE EXCEPTION 'Only admins can change role, permissions, demo flag, or specialization.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_self_escalation ON profiles;
CREATE TRIGGER trg_prevent_profile_self_escalation
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_self_escalation();
