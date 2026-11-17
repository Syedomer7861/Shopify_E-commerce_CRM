BEGIN;
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

CREATE TEMP TABLE _r (n serial, k text, ok boolean, d text);
GRANT ALL ON _r TO authenticated; GRANT USAGE ON SEQUENCE _r_n_seq TO authenticated;
CREATE TEMP TABLE _o (id uuid); GRANT ALL ON _o TO authenticated;
CREATE FUNCTION pg_temp.t(k text, ok boolean, d text DEFAULT '') RETURNS void LANGUAGE sql AS
  $f$ INSERT INTO _r (k, ok, d) VALUES (k, coalesce(ok, false), d) $f$;
CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS
  $f$ SELECT set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $f$;
SELECT pg_temp.t('premium_has_branding', EXISTS (SELECT 1 FROM plan_modules pm JOIN subscription_plans p ON p.id = pm.plan_id WHERE p.code='premium' AND pm.module_key='branding'));
SELECT pg_temp.t('basic_lacks_branding', NOT EXISTS (SELECT 1 FROM plan_modules pm JOIN subscription_plans p ON p.id = pm.plan_id WHERE p.code IN ('basic','standard') AND pm.module_key='branding'));
SELECT pg_temp.t('existing_orgs_default_empty', NOT EXISTS (SELECT 1 FROM organizations WHERE theme <> '{}'::jsonb));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('__ADMIN__');
INSERT INTO _o SELECT current_org_id();
SELECT pg_temp.as_user('__AGENT__');
DO $t$ DECLARE n int; BEGIN
  UPDATE organizations SET theme = '{"accent":"#7cc4ff"}' WHERE id = current_org_id(); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('agent_cannot_set_theme', n = 0, n::text);
  PERFORM pg_temp.t('agent_can_read_theme', (SELECT theme FROM organizations WHERE id = current_org_id()) IS NOT NULL);
END $t$;
SELECT pg_temp.as_user('__ADMIN__');
DO $t$ DECLARE n int; BEGIN
  UPDATE organizations SET theme = '{"accent":"#7cc4ff","radius":12,"density":"compact","preset":"clinic"}' WHERE id = current_org_id(); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('admin_can_set_theme', n = 1, n::text);
  BEGIN UPDATE organizations SET theme = '{"accent":"red"}' WHERE id = current_org_id();
    PERFORM pg_temp.t('bad_accent_rejected', false); EXCEPTION WHEN check_violation THEN PERFORM pg_temp.t('bad_accent_rejected', true); END;
  BEGIN UPDATE organizations SET theme = '{"css":"x"}' WHERE id = current_org_id();
    PERFORM pg_temp.t('unknown_key_rejected', false); EXCEPTION WHEN check_violation THEN PERFORM pg_temp.t('unknown_key_rejected', true); END;
  BEGIN UPDATE organizations SET theme = '{"radius":99}' WHERE id = current_org_id();
    PERFORM pg_temp.t('radius_range_rejected', false); EXCEPTION WHEN check_violation THEN PERFORM pg_temp.t('radius_range_rejected', true); END;
END $t$;
SELECT pg_temp.as_user('__OTHER_ADMIN__');
DO $t$ DECLARE n int; BEGIN
  UPDATE organizations SET theme = '{"accent":"#ffffff"}' WHERE id = (SELECT id FROM _o); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('other_org_admin_cannot_set', n = 0, n::text);
END $t$;
RESET ROLE;
UPDATE organizations SET platform_blocked_modules = array_append(coalesce(platform_blocked_modules,'{}'), 'branding') WHERE id = (SELECT id FROM _o);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('__ADMIN__');
DO $t$ DECLARE n int; BEGIN
  BEGIN UPDATE organizations SET theme = '{"accent":"#ffd166"}' WHERE id = current_org_id();
    PERFORM pg_temp.t('blocked_plan_cannot_set', false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.t('blocked_plan_cannot_set', true); END;
  UPDATE organizations SET theme = '{}' WHERE id = current_org_id(); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('blocked_plan_can_reset', n = 1, n::text);
  UPDATE organizations SET session_timeout_minutes = session_timeout_minutes WHERE id = current_org_id(); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('other_org_updates_unaffected', n = 1, n::text);
END $t$;
RESET ROLE;
SELECT json_agg(_r ORDER BY n) AS results FROM _r;
ROLLBACK;
