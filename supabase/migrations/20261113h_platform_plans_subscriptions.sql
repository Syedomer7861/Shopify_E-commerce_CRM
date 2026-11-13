-- Phase 4a (Super Admin): plans, versioned prices, manual subscriptions, coupons.
-- No payment gateway yet (Razorpay is Phase 4b). Nothing here charges anyone
-- or blocks access; it records what each organisation is on.
--
-- Money is stored as whole paise (BIGINT), never floats.
-- Price versions are immutable once published: a price change is a new
-- version, and existing subscriptions keep the version (and the price
-- snapshot) they were sold on.
--
-- Tables are readable by the verified owner; an organisation's admins can
-- read their own subscription. Every write goes through a function below
-- that checks is_platform_owner_verified() and writes platform_audit_logs.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.platform_revenue_summary();
--   DROP FUNCTION IF EXISTS public.platform_cancel_subscription(uuid, text);
--   DROP FUNCTION IF EXISTS public.platform_assign_subscription(uuid, uuid, text, int, text, text);
--   DROP FUNCTION IF EXISTS public.platform_save_coupon(text, text, int, bigint, text, int, timestamptz, boolean);
--   DROP FUNCTION IF EXISTS public.platform_publish_plan_version(uuid, text, bigint, bigint, int);
--   DROP FUNCTION IF EXISTS public.platform_save_plan(uuid, text, text, text, boolean, boolean, int);
--   DROP FUNCTION IF EXISTS public.platform_audit(text, text, text, jsonb);
--   DROP FUNCTION IF EXISTS public.platform_require_owner();
--   DROP TABLE IF EXISTS coupon_redemptions, org_subscriptions, coupons, plan_versions, subscription_plans;
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9-]{0,19}$'),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  is_public   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  version             INT NOT NULL,
  currency            CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  price_monthly_minor BIGINT NOT NULL CHECK (price_monthly_minor >= 0),
  price_yearly_minor  BIGINT NOT NULL CHECK (price_yearly_minor >= 0),
  trial_days          INT NOT NULL DEFAULT 0 CHECK (trial_days BETWEEN 0 AND 365),
  published_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (plan_id, version)
);
CREATE INDEX IF NOT EXISTS idx_fk_plan_versions_created_by ON public.plan_versions (created_by);

CREATE TABLE IF NOT EXISTS public.coupons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(40) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  description       TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  percent_off       INT CHECK (percent_off BETWEEN 1 AND 100),
  amount_off_minor  BIGINT CHECK (amount_off_minor > 0),
  currency          CHAR(3) CHECK (currency ~ '^[A-Z]{3}$'),
  max_redemptions   INT CHECK (max_redemptions > 0),
  redeemed_count    INT NOT NULL DEFAULT 0,
  valid_until       TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((percent_off IS NULL) <> (amount_off_minor IS NULL)),
  CHECK (amount_off_minor IS NULL OR currency IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.org_subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_version_id      UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE RESTRICT,
  status               TEXT NOT NULL CHECK (status IN ('trialing','active','cancelled')),
  billing_cycle        TEXT NOT NULL CHECK (billing_cycle IN ('monthly','yearly')),
  currency             CHAR(3) NOT NULL,
  list_price_minor     BIGINT NOT NULL CHECK (list_price_minor >= 0),
  discount_minor       BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  price_minor          BIGINT NOT NULL CHECK (price_minor >= 0),
  coupon_id            UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  trial_ends_at        TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end   TIMESTAMPTZ NOT NULL,
  source               TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','razorpay')),
  notes                TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  cancelled_at         TIMESTAMPTZ,
  cancel_reason        TEXT,
  created_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_subscriptions_current ON public.org_subscriptions (org_id) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_fk_org_subscriptions_org_id ON public.org_subscriptions (org_id);
CREATE INDEX IF NOT EXISTS idx_fk_org_subscriptions_plan_version_id ON public.org_subscriptions (plan_version_id);
CREATE INDEX IF NOT EXISTS idx_fk_org_subscriptions_coupon_id ON public.org_subscriptions (coupon_id);
CREATE INDEX IF NOT EXISTS idx_fk_org_subscriptions_created_by ON public.org_subscriptions (created_by);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id        UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id  UUID NOT NULL REFERENCES public.org_subscriptions(id) ON DELETE CASCADE,
  amount_off_minor BIGINT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, org_id)
);
CREATE INDEX IF NOT EXISTS idx_fk_coupon_redemptions_org_id ON public.coupon_redemptions (org_id);
CREATE INDEX IF NOT EXISTS idx_fk_coupon_redemptions_subscription_id ON public.coupon_redemptions (subscription_id);

-- Row security: owner reads everything; org admins read their own subscription.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscription_plans','plan_versions','coupons','org_subscriptions','coupon_redemptions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "platform_owner_read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "platform_owner_read" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_owner_verified())', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "org_admin_read_own_subscription" ON public.org_subscriptions;
CREATE POLICY "org_admin_read_own_subscription" ON public.org_subscriptions FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.is_admin());

-- Shared gate.
CREATE OR REPLACE FUNCTION public.platform_require_owner()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_owner_verified() THEN
    RAISE EXCEPTION 'Owner access with two-factor required' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_require_owner() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_audit(p_action TEXT, p_type TEXT, p_id TEXT, p_details JSONB)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.platform_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_action, p_type, p_id, coalesce(p_details, '{}'::jsonb));
$$;
REVOKE EXECUTE ON FUNCTION public.platform_audit(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Create or edit a plan's name and visibility (not its price).
CREATE OR REPLACE FUNCTION public.platform_save_plan(
  p_id UUID, p_code TEXT, p_name TEXT, p_description TEXT, p_is_public BOOLEAN, p_is_active BOOLEAN, p_sort INT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  plan_id UUID;
BEGIN
  PERFORM public.platform_require_owner();
  IF p_id IS NULL THEN
    INSERT INTO public.subscription_plans (code, name, description, is_public, is_active, sort_order)
    VALUES (lower(btrim(p_code)), btrim(p_name), coalesce(p_description, ''), coalesce(p_is_public, false), coalesce(p_is_active, true), coalesce(p_sort, 0))
    RETURNING id INTO plan_id;
  ELSE
    -- The code is fixed once created: subscriptions and organizations.plan refer to it.
    UPDATE public.subscription_plans
       SET name = btrim(p_name), description = coalesce(p_description, ''), is_public = coalesce(p_is_public, is_public),
           is_active = coalesce(p_is_active, is_active), sort_order = coalesce(p_sort, sort_order)
     WHERE id = p_id
    RETURNING id INTO plan_id;
    IF plan_id IS NULL THEN RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  PERFORM public.platform_audit(CASE WHEN p_id IS NULL THEN 'plans.create' ELSE 'plans.update' END, 'subscription_plans', plan_id::text,
    jsonb_build_object('code', p_code, 'name', p_name, 'is_public', p_is_public, 'is_active', p_is_active));
  RETURN plan_id;
END $$;

-- Publish a new price for a plan. Earlier versions stay as they were.
CREATE OR REPLACE FUNCTION public.platform_publish_plan_version(
  p_plan UUID, p_currency TEXT, p_monthly BIGINT, p_yearly BIGINT, p_trial_days INT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  next_version INT;
  vid UUID;
BEGIN
  PERFORM public.platform_require_owner();
  PERFORM 1 FROM public.subscription_plans WHERE id = p_plan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO next_version FROM public.plan_versions WHERE plan_id = p_plan;
  INSERT INTO public.plan_versions (plan_id, version, currency, price_monthly_minor, price_yearly_minor, trial_days, created_by)
  VALUES (p_plan, next_version, upper(coalesce(p_currency, 'INR')), p_monthly, p_yearly, coalesce(p_trial_days, 0), auth.uid())
  RETURNING id INTO vid;
  PERFORM public.platform_audit('plans.publish_price', 'subscription_plans', p_plan::text,
    jsonb_build_object('version', next_version, 'currency', upper(coalesce(p_currency, 'INR')), 'monthly_minor', p_monthly, 'yearly_minor', p_yearly, 'trial_days', p_trial_days));
  RETURN vid;
END $$;

-- Create a coupon, or switch an existing one on or off (matched by code).
CREATE OR REPLACE FUNCTION public.platform_save_coupon(
  p_code TEXT, p_description TEXT, p_percent INT, p_amount BIGINT, p_currency TEXT,
  p_max INT, p_valid_until TIMESTAMPTZ, p_is_active BOOLEAN)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cid UUID;
  clean_code TEXT := upper(btrim(p_code));
BEGIN
  PERFORM public.platform_require_owner();
  SELECT id INTO cid FROM public.coupons WHERE code = clean_code;
  IF cid IS NULL THEN
    INSERT INTO public.coupons (code, description, percent_off, amount_off_minor, currency, max_redemptions, valid_until, is_active)
    VALUES (clean_code, coalesce(p_description, ''), p_percent, p_amount, upper(nullif(btrim(p_currency), '')), p_max, p_valid_until, coalesce(p_is_active, true))
    RETURNING id INTO cid;
    PERFORM public.platform_audit('coupons.create', 'coupons', cid::text,
      jsonb_build_object('code', clean_code, 'percent_off', p_percent, 'amount_off_minor', p_amount, 'currency', p_currency, 'max', p_max, 'valid_until', p_valid_until));
  ELSE
    -- Terms of an existing coupon never change; only on/off.
    UPDATE public.coupons SET is_active = coalesce(p_is_active, is_active) WHERE id = cid;
    PERFORM public.platform_audit(CASE WHEN p_is_active THEN 'coupons.enable' ELSE 'coupons.disable' END, 'coupons', cid::text, jsonb_build_object('code', clean_code));
  END IF;
  RETURN cid;
END $$;

-- Put an organisation on a plan version. Ends its current subscription first.
CREATE OR REPLACE FUNCTION public.platform_assign_subscription(
  p_org UUID, p_version UUID, p_cycle TEXT, p_trial_days INT, p_coupon TEXT, p_notes TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v RECORD;
  c RECORD;
  v_coupon_id UUID;
  coupon_code TEXT;
  list_price BIGINT;
  discount BIGINT := 0;
  trial INT;
  starts TIMESTAMPTZ := now();
  period_start TIMESTAMPTZ;
  sub_id UUID;
BEGIN
  PERFORM public.platform_require_owner();
  IF p_cycle NOT IN ('monthly','yearly') THEN RAISE EXCEPTION 'Billing cycle must be monthly or yearly'; END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found' USING ERRCODE = 'P0002'; END IF;
  SELECT pv.*, sp.code, sp.is_active AS plan_active INTO v
    FROM public.plan_versions pv JOIN public.subscription_plans sp ON sp.id = pv.plan_id WHERE pv.id = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan version not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT v.plan_active THEN RAISE EXCEPTION 'That plan is switched off'; END IF;

  list_price := CASE WHEN p_cycle = 'monthly' THEN v.price_monthly_minor ELSE v.price_yearly_minor END;
  trial := coalesce(p_trial_days, v.trial_days);
  IF trial < 0 OR trial > 365 THEN RAISE EXCEPTION 'Trial must be 0 to 365 days'; END IF;

  IF nullif(btrim(p_coupon), '') IS NOT NULL THEN
    SELECT * INTO c FROM public.coupons WHERE code = upper(btrim(p_coupon)) FOR UPDATE;
    IF NOT FOUND OR NOT c.is_active THEN RAISE EXCEPTION 'Coupon not found or switched off'; END IF;
    IF c.valid_until IS NOT NULL AND c.valid_until < now() THEN RAISE EXCEPTION 'Coupon has expired'; END IF;
    IF c.max_redemptions IS NOT NULL AND c.redeemed_count >= c.max_redemptions THEN RAISE EXCEPTION 'Coupon has been used up'; END IF;
    IF EXISTS (SELECT 1 FROM public.coupon_redemptions WHERE coupon_id = c.id AND org_id = p_org) THEN
      RAISE EXCEPTION 'This organisation already used that coupon';
    END IF;
    IF c.amount_off_minor IS NOT NULL AND c.currency <> v.currency THEN
      RAISE EXCEPTION 'Coupon currency (%) does not match plan currency (%)', c.currency, v.currency;
    END IF;
    -- Integer maths: percentage rounds down to whole paise.
    discount := least(list_price, coalesce(c.amount_off_minor, list_price * c.percent_off / 100));
    v_coupon_id := c.id;
    coupon_code := c.code;
  END IF;

  UPDATE public.org_subscriptions SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Replaced by a new subscription'
   WHERE org_id = p_org AND status <> 'cancelled';

  period_start := starts + make_interval(days => trial);
  INSERT INTO public.org_subscriptions (org_id, plan_version_id, status, billing_cycle, currency, list_price_minor, discount_minor,
    price_minor, coupon_id, trial_ends_at, current_period_start, current_period_end, notes, created_by)
  VALUES (p_org, p_version, CASE WHEN trial > 0 THEN 'trialing' ELSE 'active' END, p_cycle, v.currency, list_price, discount,
    list_price - discount, v_coupon_id, CASE WHEN trial > 0 THEN period_start END, period_start,
    period_start + CASE WHEN p_cycle = 'monthly' THEN interval '1 month' ELSE interval '1 year' END,
    coalesce(p_notes, ''), auth.uid())
  RETURNING id INTO sub_id;

  IF v_coupon_id IS NOT NULL THEN
    INSERT INTO public.coupon_redemptions (coupon_id, org_id, subscription_id, amount_off_minor) VALUES (v_coupon_id, p_org, sub_id, discount);
    UPDATE public.coupons SET redeemed_count = redeemed_count + 1 WHERE id = v_coupon_id;
  END IF;

  -- Keep the old display column in step (its trigger logs the change too).
  UPDATE public.organizations SET plan = v.code WHERE id = p_org AND plan IS DISTINCT FROM v.code;

  PERFORM public.platform_audit('subscriptions.assign', 'organizations', p_org::text,
    jsonb_build_object('subscription_id', sub_id, 'plan', v.code, 'version', v.version, 'cycle', p_cycle,
      'currency', v.currency, 'list_price_minor', list_price, 'discount_minor', discount, 'trial_days', trial,
      'coupon', coupon_code));
  RETURN sub_id;
END $$;

CREATE OR REPLACE FUNCTION public.platform_cancel_subscription(p_subscription UUID, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  org UUID;
BEGIN
  PERFORM public.platform_require_owner();
  UPDATE public.org_subscriptions SET status = 'cancelled', cancelled_at = now(), cancel_reason = coalesce(nullif(btrim(p_reason), ''), 'Cancelled by owner')
   WHERE id = p_subscription AND status <> 'cancelled'
  RETURNING org_id INTO org;
  IF org IS NULL THEN RAISE EXCEPTION 'No current subscription with that id' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.platform_audit('subscriptions.cancel', 'organizations', org::text,
    jsonb_build_object('subscription_id', p_subscription, 'reason', p_reason));
END $$;

-- Contracted recurring revenue from current paid subscriptions, per currency.
-- This is what organisations are signed up to pay, not money received.
CREATE OR REPLACE FUNCTION public.platform_revenue_summary()
RETURNS TABLE (currency CHAR(3), active_subscriptions BIGINT, trialing BIGINT, contracted_mrr_minor BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.currency,
    count(*) FILTER (WHERE s.status = 'active'),
    count(*) FILTER (WHERE s.status = 'trialing'),
    coalesce(sum(CASE WHEN s.billing_cycle = 'monthly' THEN s.price_minor ELSE s.price_minor / 12 END)
             FILTER (WHERE s.status = 'active'), 0)::bigint
  FROM public.org_subscriptions s
  WHERE public.is_platform_owner_verified() AND s.status <> 'cancelled'
  GROUP BY s.currency
  ORDER BY s.currency;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'platform_save_plan(uuid, text, text, text, boolean, boolean, int)',
    'platform_publish_plan_version(uuid, text, bigint, bigint, int)',
    'platform_save_coupon(text, text, int, bigint, text, int, timestamptz, boolean)',
    'platform_assign_subscription(uuid, uuid, text, int, text, text)',
    'platform_cancel_subscription(uuid, text)',
    'platform_revenue_summary()'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

COMMIT;
