-- Phase 5 (Super Admin): module registry, plan entitlements, per-org
-- overrides, and feature flags.
--
-- Modules: the same keys organisation admins already switch off on their
-- Organisation page (src/lib/modules.ts SWITCHABLE_MODULES). The owner can
--   - switch a module off platform-wide (kill switch),
--   - limit which modules a plan includes (a plan with no list includes all),
--   - force a module on or off for one organisation.
-- The result is stored in organizations.platform_blocked_modules and read by
-- perm_scope(), next to the organisation's own disabled_modules. So a blocked
-- module is closed in the database for everyone in that org, admins
-- included, exactly like the existing switch. Data is never touched.
--
-- Deploying this changes nothing for anyone: every module starts available,
-- no plan has a list, there are no overrides, so every org's blocked list is
-- empty.
--
-- Feature flags: a global on/off, a percentage rollout by organisation
-- (stable hash, so an org stays in or out as the percentage grows), and
-- per-org force on/off. my_org_controls() returns the caller's flags.
--
-- Rollback:
--   Restore perm_scope and my_org_controls from 20261111g, then
--   DROP FUNCTION IF EXISTS public.platform_set_flag_org(text, uuid, boolean);
--   DROP FUNCTION IF EXISTS public.platform_save_flag(text, text, boolean, int);
--   DROP FUNCTION IF EXISTS public.platform_set_org_module(uuid, text, boolean);
--   DROP FUNCTION IF EXISTS public.platform_set_plan_modules(uuid, text[]);
--   DROP FUNCTION IF EXISTS public.platform_set_module_available(text, boolean);
--   DROP TRIGGER IF EXISTS trg_recompute_org_modules ON org_subscriptions;
--   DROP FUNCTION IF EXISTS public.trg_recompute_org_modules();
--   DROP FUNCTION IF EXISTS public.platform_recompute_org_modules(uuid);
--   DROP FUNCTION IF EXISTS public.org_feature_flags(uuid);
--   DROP TABLE IF EXISTS feature_flag_orgs, feature_flags, org_module_overrides, plan_modules, platform_modules;
--   ALTER TABLE organizations DROP COLUMN IF EXISTS platform_blocked_modules;
-- Safe to re-run.

BEGIN;

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS platform_blocked_modules TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.platform_modules (
  key          TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9-]{2,40}$'),
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order   INT NOT NULL DEFAULT 0
);
INSERT INTO public.platform_modules (key, name, description, sort_order) VALUES
  ('commerce',  'Sales & call centre', 'Call queue, customers, orders, carts, campaigns, recordings, sales analytics', 1),
  ('leads',     'Leads',        'Lead pipeline', 2),
  ('deals',     'Deals',        'Deal pipeline', 3),
  ('visits',    'Field Visits', 'Planned visits and check-ins', 4),
  ('tickets',   'Service Desk', 'Internal tickets with SLA clocks', 5),
  ('approvals', 'Approvals',    'Requests waiting on a decision', 6),
  ('expenses',  'Expenses',     'Expense claims', 7),
  ('vendors',   'Vendors',      'Vendor records', 8),
  ('invoices',  'Invoices',     'Invoices', 9)
ON CONFLICT (key) DO NOTHING;

-- Which modules a plan includes. No rows for a plan = the plan includes everything.
CREATE TABLE IF NOT EXISTS public.plan_modules (
  plan_id    UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.platform_modules(key) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, module_key)
);
CREATE INDEX IF NOT EXISTS idx_fk_plan_modules_module_key ON public.plan_modules (module_key);

CREATE TABLE IF NOT EXISTS public.org_module_overrides (
  org_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.platform_modules(key) ON DELETE CASCADE,
  enabled    BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, module_key)
);
CREATE INDEX IF NOT EXISTS idx_fk_org_module_overrides_module_key ON public.org_module_overrides (module_key);

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key             TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9][a-z0-9_.-]{1,59}$'),
  description     TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  is_enabled      BOOLEAN NOT NULL DEFAULT false,
  rollout_percent INT NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_flag_orgs (
  flag_key TEXT NOT NULL REFERENCES public.feature_flags(key) ON DELETE CASCADE,
  org_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled  BOOLEAN NOT NULL,
  PRIMARY KEY (flag_key, org_id)
);
CREATE INDEX IF NOT EXISTS idx_fk_feature_flag_orgs_org_id ON public.feature_flag_orgs (org_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_modules','plan_modules','org_module_overrides','feature_flags','feature_flag_orgs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "platform_owner_read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "platform_owner_read" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_owner_verified())', t);
  END LOOP;
END $$;

-- Recompute one organisation's blocked list. Order of rules:
--   platform kill switch > owner override > plan list.
CREATE OR REPLACE FUNCTION public.platform_recompute_org_modules(p_org UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plan UUID;
  plan_limited BOOLEAN;
  blocked TEXT[];
BEGIN
  SELECT pv.plan_id INTO v_plan
    FROM public.org_subscriptions s JOIN public.plan_versions pv ON pv.id = s.plan_version_id
   WHERE s.org_id = p_org AND s.status <> 'cancelled';
  plan_limited := v_plan IS NOT NULL AND EXISTS (SELECT 1 FROM public.plan_modules WHERE plan_id = v_plan);

  SELECT coalesce(array_agg(m.key ORDER BY m.sort_order), '{}') INTO blocked
    FROM public.platform_modules m
    LEFT JOIN public.org_module_overrides o ON o.org_id = p_org AND o.module_key = m.key
   WHERE NOT m.is_available
      OR o.enabled = false
      OR (o.enabled IS NULL AND plan_limited
          AND NOT EXISTS (SELECT 1 FROM public.plan_modules pm WHERE pm.plan_id = v_plan AND pm.module_key = m.key));

  UPDATE public.organizations SET platform_blocked_modules = blocked
   WHERE id = p_org AND platform_blocked_modules IS DISTINCT FROM blocked;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_recompute_org_modules(UUID) FROM PUBLIC, anon, authenticated;

-- A subscription change can change the plan, so recompute that org.
CREATE OR REPLACE FUNCTION public.trg_recompute_org_modules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_recompute_org_modules(NEW.org_id);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_recompute_org_modules() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_recompute_org_modules ON public.org_subscriptions;
CREATE TRIGGER trg_recompute_org_modules AFTER INSERT OR UPDATE ON public.org_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_org_modules();

-- Owner writes.
CREATE OR REPLACE FUNCTION public.platform_set_module_available(p_key TEXT, p_available BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o UUID;
BEGIN
  PERFORM public.platform_require_owner();
  UPDATE public.platform_modules SET is_available = p_available WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown module' USING ERRCODE = 'P0002'; END IF;
  FOR o IN SELECT id FROM public.organizations LOOP PERFORM public.platform_recompute_org_modules(o); END LOOP;
  PERFORM public.platform_audit(CASE WHEN p_available THEN 'modules.enable' ELSE 'modules.disable' END, 'platform_modules', p_key, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.platform_set_plan_modules(p_plan UUID, p_keys TEXT[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  o UUID;
  clean TEXT[] := (SELECT coalesce(array_agg(DISTINCT k), '{}') FROM unnest(coalesce(p_keys, '{}')) k);
BEGIN
  PERFORM public.platform_require_owner();
  PERFORM 1 FROM public.subscription_plans WHERE id = p_plan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(clean) k WHERE k NOT IN (SELECT key FROM public.platform_modules)) THEN
    RAISE EXCEPTION 'Unknown module in list';
  END IF;
  DELETE FROM public.plan_modules WHERE plan_id = p_plan;
  INSERT INTO public.plan_modules (plan_id, module_key) SELECT p_plan, k FROM unnest(clean) k;
  FOR o IN SELECT s.org_id FROM public.org_subscriptions s JOIN public.plan_versions pv ON pv.id = s.plan_version_id
            WHERE pv.plan_id = p_plan AND s.status <> 'cancelled' LOOP
    PERFORM public.platform_recompute_org_modules(o);
  END LOOP;
  PERFORM public.platform_audit('plans.modules', 'subscription_plans', p_plan::text,
    jsonb_build_object('modules', CASE WHEN cardinality(clean) = 0 THEN to_jsonb('all'::text) ELSE to_jsonb(clean) END));
END $$;

-- p_enabled NULL removes the override (back to the plan's rule).
CREATE OR REPLACE FUNCTION public.platform_set_org_module(p_org UUID, p_key TEXT, p_enabled BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_require_owner();
  IF p_enabled IS NULL THEN
    DELETE FROM public.org_module_overrides WHERE org_id = p_org AND module_key = p_key;
  ELSE
    INSERT INTO public.org_module_overrides (org_id, module_key, enabled) VALUES (p_org, p_key, p_enabled)
    ON CONFLICT (org_id, module_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();
  END IF;
  PERFORM public.platform_recompute_org_modules(p_org);
  PERFORM public.platform_audit('organizations.module_override', 'organizations', p_org::text,
    jsonb_build_object('module', p_key, 'enabled', p_enabled));
END $$;

CREATE OR REPLACE FUNCTION public.platform_save_flag(p_key TEXT, p_description TEXT, p_enabled BOOLEAN, p_percent INT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_require_owner();
  INSERT INTO public.feature_flags (key, description, is_enabled, rollout_percent)
  VALUES (lower(btrim(p_key)), coalesce(p_description, ''), coalesce(p_enabled, false), coalesce(p_percent, 0))
  ON CONFLICT (key) DO UPDATE SET description = coalesce(p_description, feature_flags.description),
    is_enabled = coalesce(p_enabled, feature_flags.is_enabled), rollout_percent = coalesce(p_percent, feature_flags.rollout_percent), updated_at = now();
  PERFORM public.platform_audit('flags.save', 'feature_flags', lower(btrim(p_key)),
    jsonb_build_object('enabled', p_enabled, 'rollout_percent', p_percent));
END $$;

-- p_enabled NULL removes the org's override (back to the rollout percentage).
CREATE OR REPLACE FUNCTION public.platform_set_flag_org(p_key TEXT, p_org UUID, p_enabled BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_require_owner();
  IF p_enabled IS NULL THEN
    DELETE FROM public.feature_flag_orgs WHERE flag_key = p_key AND org_id = p_org;
  ELSE
    INSERT INTO public.feature_flag_orgs (flag_key, org_id, enabled) VALUES (p_key, p_org, p_enabled)
    ON CONFLICT (flag_key, org_id) DO UPDATE SET enabled = EXCLUDED.enabled;
  END IF;
  PERFORM public.platform_audit('flags.org_override', 'feature_flags', p_key,
    jsonb_build_object('org_id', p_org, 'enabled', p_enabled));
END $$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'platform_set_module_available(text, boolean)', 'platform_set_plan_modules(uuid, text[])',
    'platform_set_org_module(uuid, text, boolean)', 'platform_save_flag(text, text, boolean, int)',
    'platform_set_flag_org(text, uuid, boolean)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

-- Flags on for one organisation. Global switch must be on; then an org
-- override wins; otherwise the org is in the rollout when its stable hash
-- bucket (0-99) is below the percentage.
CREATE OR REPLACE FUNCTION public.org_feature_flags(p_org UUID)
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(f.key ORDER BY f.key), '{}')
    FROM public.feature_flags f
    LEFT JOIN public.feature_flag_orgs fo ON fo.flag_key = f.key AND fo.org_id = p_org
   WHERE p_org IS NOT NULL AND f.is_enabled
     AND coalesce(fo.enabled, abs(hashtext(f.key || ':' || p_org::text)) % 100 < f.rollout_percent);
$$;
REVOKE EXECUTE ON FUNCTION public.org_feature_flags(UUID) FROM PUBLIC, anon, authenticated;

-- Enforcement: perm_scope now also closes platform-blocked modules.
CREATE OR REPLACE FUNCTION public.perm_scope(module TEXT, action TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN module = ANY (o.disabled_modules) OR module = ANY (o.platform_blocked_modules) THEN NULL
              WHEN p.role = 'admin' THEN 'organisation'
              ELSE (SELECT r.grants -> module ->> action FROM roles r WHERE r.org_id = p.org_id AND r.name = p.role) END
  FROM profiles p JOIN organizations o ON o.id = p.org_id
  WHERE p.id = auth.uid() AND o.is_active AND p.is_active;
$$;

-- The app's view of its own org: the new columns are added at the end, so
-- the current app (which reads the first two by name) keeps working.
DROP FUNCTION IF EXISTS public.my_org_controls();
CREATE FUNCTION public.my_org_controls()
RETURNS TABLE (disabled_modules TEXT[], session_timeout_minutes INT, platform_blocked_modules TEXT[], feature_flags TEXT[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.disabled_modules, o.session_timeout_minutes, o.platform_blocked_modules, public.org_feature_flags(o.id)
    FROM organizations o WHERE o.id = public.current_org_id();
$$;
REVOKE EXECUTE ON FUNCTION public.my_org_controls() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_org_controls() TO authenticated;

COMMIT;
