-- Custom app theme per organisation (2026-11-18).
--
-- 1. New platform module 'branding', included in the Premium plan only.
--    Basic/Standard subscribers get it blocked by platform_recompute_org_modules.
--    Orgs with no subscription keep "no plan = everything" (existing rule).
-- 2. organizations.theme jsonb: { accent "#rrggbb", radius 8..28, density
--    "comfortable"|"compact", preset text }. Shape enforced by CHECK.
--    Admins already update their own org row (organizations_admin_manage).
-- 3. Guard trigger: a theme change is refused while 'branding' is blocked for
--    the org, unless it resets to '{}' or the platform owner does it.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_guard_org_theme ON public.organizations;
--   DROP FUNCTION IF EXISTS public.trg_guard_org_theme_fn();
--   ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_theme_shape;
--   ALTER TABLE public.organizations DROP COLUMN IF EXISTS theme;
--   DELETE FROM public.platform_modules WHERE key = 'branding';  -- cascades plan_modules
--   then recompute subscribed orgs (loop below).
-- Safe to re-run.

BEGIN;

INSERT INTO public.platform_modules (key, name, description, sort_order)
VALUES ('branding', 'Custom branding', 'Organisation colour, corner style and table density', 10)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.plan_modules (plan_id, module_key)
SELECT p.id, 'branding' FROM public.subscription_plans p WHERE p.code = 'premium'
ON CONFLICT DO NOTHING;

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_theme_shape;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_theme_shape CHECK (
  jsonb_typeof(theme) = 'object'
  AND theme - ARRAY['accent','radius','density','preset'] = '{}'::jsonb
  AND (NOT theme ? 'accent'  OR (jsonb_typeof(theme->'accent') = 'string' AND theme->>'accent' ~ '^#[0-9a-fA-F]{6}$'))
  AND (NOT theme ? 'radius'  OR (jsonb_typeof(theme->'radius') = 'number' AND (theme->>'radius')::numeric BETWEEN 8 AND 28))
  AND (NOT theme ? 'density' OR theme->>'density' IN ('comfortable','compact'))
  AND (NOT theme ? 'preset'  OR (jsonb_typeof(theme->'preset') = 'string' AND length(theme->>'preset') <= 40))
);

CREATE OR REPLACE FUNCTION public.trg_guard_org_theme_fn()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.theme IS DISTINCT FROM OLD.theme
     AND NEW.theme <> '{}'::jsonb
     AND 'branding' = ANY(coalesce(NEW.platform_blocked_modules, '{}'))
     AND NOT public.is_platform_owner_verified() THEN
    RAISE EXCEPTION 'Custom branding is not included in your plan' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_guard_org_theme_fn() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_org_theme ON public.organizations;
CREATE TRIGGER trg_guard_org_theme BEFORE UPDATE OF theme ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_org_theme_fn();

DO $$
DECLARE o UUID;
BEGIN
  FOR o IN SELECT DISTINCT s.org_id FROM public.org_subscriptions s WHERE s.status <> 'cancelled' LOOP
    PERFORM public.platform_recompute_org_modules(o);
  END LOOP;
END $$;

COMMIT;
