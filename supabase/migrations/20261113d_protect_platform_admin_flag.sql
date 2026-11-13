-- Phase 1a (Super Admin audit, S1): nobody can grant or remove the platform
-- owner flag from the app.
--
-- Before this, profiles_self_update let any signed-in user update their own
-- row, authenticated held UPDATE on every profiles column, and
-- prevent_profile_self_escalation did not check is_platform_admin (and skips
-- org admins entirely). So any user could set is_platform_admin = true on
-- themselves and gain the owner's access to every organisation, every
-- contact request and /api/signup.
--
-- The flag can still be changed with the server key or the SQL editor
-- (auth.uid() is null there). Only one profile holds it today.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_protect_platform_admin_flag ON profiles;
--   DROP FUNCTION IF EXISTS public.protect_platform_admin_flag();
--   GRANT UPDATE (is_platform_admin) ON profiles TO authenticated;
-- Safe to re-run.
BEGIN;

CREATE OR REPLACE FUNCTION public.protect_platform_admin_flag()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.is_platform_admin THEN
    RAISE EXCEPTION 'The platform owner flag cannot be set from the app.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    RAISE EXCEPTION 'The platform owner flag cannot be changed from the app.';
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.protect_platform_admin_flag() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_platform_admin_flag ON profiles;
CREATE TRIGGER trg_protect_platform_admin_flag
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_platform_admin_flag();

-- Extra layer. On its own this is not enough: authenticated also holds
-- table-wide UPDATE, which covers every column. The trigger is the guard.
REVOKE UPDATE (is_platform_admin) ON profiles FROM authenticated, anon;

COMMIT;
