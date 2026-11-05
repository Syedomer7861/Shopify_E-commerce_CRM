-- Phase 2b: profiles.role accepts any name that exists in `roles` for that
-- profile's org, not just the 5 hardcoded strings. Replaces the CHECK
-- constraint (which can't reference another table) with a trigger, same
-- mechanism already used for self-escalation prevention
-- (prevent_profile_self_escalation, 20260826c).

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

CREATE OR REPLACE FUNCTION public.validate_profile_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE org_id = NEW.org_id AND name = NEW.role) THEN
    RAISE EXCEPTION 'Role "%" does not exist for this organization.', NEW.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_profile_role ON profiles;
CREATE TRIGGER trg_validate_profile_role
  BEFORE INSERT OR UPDATE OF role, org_id ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_role();
