-- Self-serve signup and Razorpay auto-debit subscriptions.
--
-- 1. organizations.billing_hold: a workspace created through self-serve
--    signup starts on hold until its payment mandate is authorised, and goes
--    back on hold if Razorpay halts or the subscription ends. Held orgs are
--    locked out by current_org_id(), the same way is_active already works.
--    Default false, so every existing organisation is unaffected.
-- 2. my_org_billing(): lets a member of a held org learn only that fact,
--    so the app can send them to /billing.
-- 3. billing_checkouts / platform_razorpay_plans / platform_payments:
--    server-only bookkeeping (service role writes; owner reads).
-- 4. billing_apply(): the one place a Razorpay event changes access.
--    Service role only; called by the webhook and the checkout verify route.
--
-- Rollback:
--   CREATE OR REPLACE FUNCTION public.current_org_id() ... without "AND NOT o.billing_hold"
--     (definition: SELECT p.org_id FROM public.profiles p JOIN public.organizations o
--      ON o.id = p.org_id WHERE p.id = auth.uid() AND o.is_active;)
--   DROP FUNCTION IF EXISTS public.billing_apply(text, text, timestamptz, timestamptz, timestamptz);
--   DROP FUNCTION IF EXISTS public.my_org_billing();
--   DROP TABLE IF EXISTS public.platform_payments, public.platform_razorpay_plans, public.billing_checkouts;
--   ALTER TABLE public.org_subscriptions DROP COLUMN IF EXISTS razorpay_subscription_id;
--   ALTER TABLE public.organizations DROP COLUMN IF EXISTS billing_state, DROP COLUMN IF EXISTS billing_hold;
-- Safe to re-run.
BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_hold  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_state TEXT CHECK (billing_state IN ('pending','active','past_due','halted','cancelled'));

ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_subscriptions_razorpay ON public.org_subscriptions (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.platform_razorpay_plans (
  plan_version_id  UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE RESTRICT,
  billing_cycle    TEXT NOT NULL CHECK (billing_cycle IN ('monthly','yearly')),
  razorpay_plan_id TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_version_id, billing_cycle)
);

CREATE TABLE IF NOT EXISTS public.billing_checkouts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_version_id          UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE RESTRICT,
  billing_cycle            TEXT NOT NULL CHECK (billing_cycle IN ('monthly','yearly')),
  trial_days               INT NOT NULL DEFAULT 0 CHECK (trial_days BETWEEN 0 AND 365),
  razorpay_subscription_id TEXT UNIQUE,
  last_event_at            TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fk_billing_checkouts_org_id ON public.billing_checkouts (org_id);
CREATE INDEX IF NOT EXISTS idx_fk_billing_checkouts_plan_version_id ON public.billing_checkouts (plan_version_id);

CREATE TABLE IF NOT EXISTS public.platform_payments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_payment_id      TEXT NOT NULL UNIQUE,
  razorpay_subscription_id TEXT,
  org_id                   UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  amount_minor             BIGINT NOT NULL,
  currency                 CHAR(3) NOT NULL,
  status                   TEXT NOT NULL,
  paid_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fk_platform_payments_org_id ON public.platform_payments (org_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_razorpay_plans','billing_checkouts','platform_payments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "platform_owner_read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "platform_owner_read" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_owner_verified())', t);
  END LOOP;
END $$;

-- Held orgs are locked out exactly like inactive ones.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.org_id FROM public.profiles p
  JOIN public.organizations o ON o.id = p.org_id
  WHERE p.id = auth.uid() AND o.is_active AND NOT o.billing_hold;
$$;

CREATE OR REPLACE FUNCTION public.my_org_billing()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('hold', o.billing_hold, 'state', o.billing_state)
  FROM public.profiles p JOIN public.organizations o ON o.id = p.org_id
  WHERE p.id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.my_org_billing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_org_billing() TO authenticated;

-- p_action: start | charged | past_due | halt | cancel (see src/lib/billing.ts).
-- Returns the org id, or NULL when the subscription is not one of ours.
CREATE OR REPLACE FUNCTION public.billing_apply(
  p_rzp_sub TEXT, p_action TEXT, p_event_at TIMESTAMPTZ, p_period_start TIMESTAMPTZ, p_period_end TIMESTAMPTZ)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  ck RECORD;
  v RECORD;
  sub_id UUID;
  price BIGINT;
  trial_end TIMESTAMPTZ;
BEGIN
  IF p_action NOT IN ('start','charged','past_due','halt','cancel') THEN RAISE EXCEPTION 'Unknown billing action %', p_action; END IF;
  SELECT * INTO ck FROM public.billing_checkouts WHERE razorpay_subscription_id = p_rzp_sub FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Razorpay may deliver events out of order; an older event never undoes a newer one.
  IF p_event_at IS NOT NULL AND ck.last_event_at IS NOT NULL AND p_event_at < ck.last_event_at THEN RETURN ck.org_id; END IF;
  IF p_event_at IS NOT NULL THEN
    UPDATE public.billing_checkouts SET last_event_at = p_event_at WHERE id = ck.id;
  END IF;

  SELECT id INTO sub_id FROM public.org_subscriptions WHERE razorpay_subscription_id = p_rzp_sub;

  IF p_action IN ('start','charged') THEN
    IF sub_id IS NULL THEN
      SELECT pv.*, sp.code INTO v FROM public.plan_versions pv JOIN public.subscription_plans sp ON sp.id = pv.plan_id WHERE pv.id = ck.plan_version_id;
      price := CASE WHEN ck.billing_cycle = 'monthly' THEN v.price_monthly_minor ELSE v.price_yearly_minor END;
      trial_end := CASE WHEN ck.trial_days > 0 THEN ck.created_at + make_interval(days => ck.trial_days) END;
      UPDATE public.org_subscriptions SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Replaced by a new subscription'
       WHERE org_id = ck.org_id AND status <> 'cancelled';
      INSERT INTO public.org_subscriptions (org_id, plan_version_id, status, billing_cycle, currency, list_price_minor, price_minor,
        trial_ends_at, current_period_start, current_period_end, source, razorpay_subscription_id, notes)
      VALUES (ck.org_id, ck.plan_version_id,
        CASE WHEN trial_end > now() AND p_action = 'start' THEN 'trialing' ELSE 'active' END,
        ck.billing_cycle, v.currency, price, price,
        trial_end,
        coalesce(p_period_start, trial_end, now()),
        coalesce(p_period_end, coalesce(trial_end, now()) + CASE WHEN ck.billing_cycle = 'monthly' THEN interval '1 month' ELSE interval '1 year' END),
        'razorpay', p_rzp_sub, 'Self-serve')
      RETURNING id INTO sub_id;
      UPDATE public.organizations SET plan = v.code WHERE id = ck.org_id AND plan IS DISTINCT FROM v.code;
    ELSE
      -- A halted subscription Razorpay later resumes reopens its own row,
      -- unless the org has moved on to another current subscription.
      UPDATE public.org_subscriptions s SET
        status = CASE WHEN p_action = 'charged' OR s.status = 'cancelled' THEN 'active' ELSE s.status END,
        cancelled_at = NULL, cancel_reason = NULL,
        current_period_start = coalesce(p_period_start, s.current_period_start),
        current_period_end = coalesce(p_period_end, s.current_period_end)
      WHERE s.id = sub_id AND (s.status <> 'cancelled' OR NOT EXISTS (
        SELECT 1 FROM public.org_subscriptions o2 WHERE o2.org_id = ck.org_id AND o2.status <> 'cancelled'));
    END IF;
    UPDATE public.organizations o SET billing_hold = false, billing_state = 'active'
     WHERE o.id = ck.org_id AND EXISTS (SELECT 1 FROM public.org_subscriptions s WHERE s.org_id = o.id AND s.status <> 'cancelled');

  ELSIF p_action = 'past_due' THEN
    -- Razorpay keeps retrying; access stays on until it halts.
    UPDATE public.organizations SET billing_state = 'past_due' WHERE id = ck.org_id AND NOT billing_hold;

  ELSE
    UPDATE public.org_subscriptions SET status = 'cancelled', cancelled_at = now(),
      cancel_reason = CASE WHEN p_action = 'halt' THEN 'payment_halted' ELSE 'subscription_ended' END
     WHERE razorpay_subscription_id = p_rzp_sub AND status <> 'cancelled';
    -- Only hold the org if this was its current billing route (a replaced
    -- Razorpay subscription ending must not lock out a paying workspace).
    UPDATE public.organizations o SET billing_hold = true,
      billing_state = CASE WHEN p_action = 'halt' THEN 'halted' ELSE 'cancelled' END
     WHERE o.id = ck.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_subscriptions s WHERE s.org_id = o.id AND s.status <> 'cancelled');
  END IF;

  RETURN ck.org_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.billing_apply(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_apply(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMIT;
