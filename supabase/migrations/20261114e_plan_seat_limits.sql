-- Team-member (seat) limits per plan, enforced in the database.
--
-- subscription_plans.max_users      seats a plan includes (NULL = unlimited)
-- organizations.max_users_override  owner-set seats for one workspace (custom
--                                   deals, extra seats); wins over the plan
-- Limit = override, else the plan of the workspace's current (non-cancelled)
-- subscription. No subscription and no override = no limit, so existing
-- workspaces and held sign-ups are unaffected.
--
-- A seat = an active, non-demo, non-platform-admin profile in the workspace.
-- trg_enforce_seat_limit blocks adding or re-activating a member over the
-- limit from any path (team page, HR, API). Members already over the limit
-- after a downgrade keep working; only additions are blocked.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_enforce_seat_limit ON public.profiles;
--   DROP FUNCTION IF EXISTS public.enforce_seat_limit(), public.my_seat_status(), public.platform_org_seats(uuid), public.org_seat_status(uuid),
--     public.org_seat_limit(uuid), public.org_seats_used(uuid, uuid),
--     public.platform_set_plan_limits(uuid, int), public.platform_set_org_seat_override(uuid, int);
--   ALTER TABLE public.organizations DROP COLUMN IF EXISTS max_users_override;
--   ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS max_users;
-- Safe to re-run.

BEGIN;

ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS max_users INT CHECK (max_users IS NULL OR max_users BETWEEN 1 AND 100000);
ALTER TABLE public.organizations     ADD COLUMN IF NOT EXISTS max_users_override INT CHECK (max_users_override IS NULL OR max_users_override BETWEEN 1 AND 100000);

CREATE OR REPLACE FUNCTION public.org_seat_limit(p_org UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(o.max_users_override, (
    SELECT sp.max_users FROM public.org_subscriptions s
      JOIN public.plan_versions pv ON pv.id = s.plan_version_id
      JOIN public.subscription_plans sp ON sp.id = pv.plan_id
     WHERE s.org_id = p_org AND s.status <> 'cancelled'
     ORDER BY s.created_at DESC LIMIT 1))
  FROM public.organizations o WHERE o.id = p_org
$$;

CREATE OR REPLACE FUNCTION public.org_seats_used(p_org UUID, p_exclude UUID DEFAULT NULL)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::int FROM public.profiles
   WHERE org_id = p_org AND is_active IS NOT FALSE
     AND NOT coalesce(is_platform_admin, false) AND NOT coalesce(is_demo, false)
     AND id IS DISTINCT FROM p_exclude
$$;

CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE lim INT;
BEGIN
  IF NEW.org_id IS NULL OR NEW.is_active IS FALSE OR coalesce(NEW.is_platform_admin, false) OR coalesce(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;
  -- Already holding a seat in this workspace: nothing new is taken.
  IF TG_OP = 'UPDATE' AND OLD.org_id IS NOT DISTINCT FROM NEW.org_id AND OLD.is_active IS NOT FALSE
     AND NOT coalesce(OLD.is_platform_admin, false) AND NOT coalesce(OLD.is_demo, false) THEN
    RETURN NEW;
  END IF;
  lim := public.org_seat_limit(NEW.org_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  -- Serialise concurrent additions to the same workspace.
  PERFORM 1 FROM public.organizations WHERE id = NEW.org_id FOR UPDATE;
  IF public.org_seats_used(NEW.org_id, NEW.id) >= lim THEN
    RAISE EXCEPTION 'Your plan includes % team members and all are in use. Deactivate a member or upgrade your plan.', lim
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_seat_limit ON public.profiles;
CREATE TRIGGER trg_enforce_seat_limit BEFORE INSERT OR UPDATE OF is_active, org_id, is_demo, is_platform_admin
  ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();

-- Server-side check (service key only) and the caller's own status.
CREATE OR REPLACE FUNCTION public.org_seat_status(p_org UUID)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('limit', public.org_seat_limit(p_org), 'used', public.org_seats_used(p_org))
$$;

CREATE OR REPLACE FUNCTION public.my_seat_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o UUID := public.current_org_id();
BEGIN
  IF o IS NULL THEN RETURN NULL; END IF;
  RETURN public.org_seat_status(o);
END $$;

CREATE OR REPLACE FUNCTION public.platform_org_seats(p_org UUID)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_require_owner();
  RETURN public.org_seat_status(p_org) || jsonb_build_object('override', (SELECT max_users_override FROM public.organizations WHERE id = p_org));
END $$;

CREATE OR REPLACE FUNCTION public.platform_set_plan_limits(p_plan UUID, p_max_users INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_require_owner();
  UPDATE public.subscription_plans SET max_users = p_max_users WHERE id = p_plan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.platform_audit('plans.limits', 'subscription_plans', p_plan::text, jsonb_build_object('max_users', p_max_users));
END $$;

CREATE OR REPLACE FUNCTION public.platform_set_org_seat_override(p_org UUID, p_max_users INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_require_owner();
  UPDATE public.organizations SET max_users_override = p_max_users WHERE id = p_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.platform_audit('orgs.seat_override', 'organizations', p_org::text, jsonb_build_object('max_users', p_max_users));
END $$;

REVOKE EXECUTE ON FUNCTION public.org_seat_limit(uuid), public.org_seats_used(uuid, uuid), public.org_seat_status(uuid), public.enforce_seat_limit()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_seat_status(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.my_seat_status(), public.platform_org_seats(uuid), public.platform_set_plan_limits(uuid, int), public.platform_set_org_seat_override(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_seat_status(), public.platform_org_seats(uuid), public.platform_set_plan_limits(uuid, int), public.platform_set_org_seat_override(uuid, int) TO authenticated;

-- Launch limits for the three public plans (editable in Super Admin > Plans).
UPDATE public.subscription_plans SET max_users = CASE code WHEN 'basic' THEN 5 WHEN 'standard' THEN 25 WHEN 'premium' THEN 75 END
 WHERE code IN ('basic','standard','premium') AND max_users IS NULL;

COMMIT;
