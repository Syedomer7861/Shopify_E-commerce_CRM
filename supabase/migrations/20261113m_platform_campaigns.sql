-- Phase 8a (Super Admin): CodeCrest's own marketing campaigns, ad spend, and
-- which workspace requests each campaign brought in.
--
-- Platform-level only: these are the platform owner's campaigns, unrelated to
-- the per-organisation marketing module. No org_id, no tenant access path.
--
-- A campaign is matched to contact requests by its UTM tags (stored on
-- contact_requests.first_touch / last_touch by Phase 7a). Spend is entered by
-- hand (source = 'manual'); the column leaves room for a future ad-platform
-- import ('api') without changing the report. Money is in minor units.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.platform_campaign_report(date, date);
--   DROP FUNCTION IF EXISTS public.platform_delete_spend(uuid);
--   DROP FUNCTION IF EXISTS public.platform_add_spend(uuid, date, bigint, text);
--   DROP FUNCTION IF EXISTS public.platform_save_campaign(uuid, text, text, text, text, char, date, date, text, boolean);
--   DROP TABLE IF EXISTS platform_ad_spend, platform_campaigns;
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  utm_source   TEXT CHECK (utm_source ~ '^[a-z0-9][a-z0-9_.-]{0,99}$'),
  utm_medium   TEXT CHECK (utm_medium ~ '^[a-z0-9][a-z0-9_.-]{0,99}$'),
  utm_campaign TEXT NOT NULL CHECK (utm_campaign ~ '^[a-z0-9][a-z0-9_.-]{0,99}$'),
  currency     CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  starts_on    DATE,
  ends_on      DATE CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  notes        TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  is_archived  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
-- One campaign per tag combination, so a request can't count twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_campaigns_tags ON public.platform_campaigns (utm_campaign, coalesce(utm_source, ''));
CREATE INDEX IF NOT EXISTS idx_fk_platform_campaigns_created_by ON public.platform_campaigns (created_by);

CREATE TABLE IF NOT EXISTS public.platform_ad_spend (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES public.platform_campaigns(id) ON DELETE RESTRICT,
  spend_date   DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0 AND amount_minor < 100000000000),
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api')),
  note         TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_platform_ad_spend_campaign ON public.platform_ad_spend (campaign_id, spend_date);
CREATE INDEX IF NOT EXISTS idx_fk_platform_ad_spend_created_by ON public.platform_ad_spend (created_by);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_campaigns','platform_ad_spend'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "platform_owner_read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "platform_owner_read" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_owner_verified())', t);
  END LOOP;
END $$;

-- Create (p_id null) or edit. Tags are lower-cased; empty strings mean "any".
CREATE OR REPLACE FUNCTION public.platform_save_campaign(
  p_id UUID, p_name TEXT, p_utm_source TEXT, p_utm_medium TEXT, p_utm_campaign TEXT,
  p_currency CHAR(3), p_starts_on DATE, p_ends_on DATE, p_notes TEXT, p_is_archived BOOLEAN)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id UUID := p_id;
  v_src TEXT := nullif(lower(btrim(coalesce(p_utm_source, ''))), '');
  v_med TEXT := nullif(lower(btrim(coalesce(p_utm_medium, ''))), '');
  v_cmp TEXT := lower(btrim(coalesce(p_utm_campaign, '')));
BEGIN
  PERFORM public.platform_require_owner();
  IF v_id IS NULL THEN
    INSERT INTO public.platform_campaigns (name, utm_source, utm_medium, utm_campaign, currency, starts_on, ends_on, notes, created_by)
    VALUES (btrim(p_name), v_src, v_med, v_cmp, upper(coalesce(p_currency, 'INR')), p_starts_on, p_ends_on, coalesce(p_notes, ''), auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.platform_audit('campaign.create', 'platform_campaign', v_id::text, jsonb_build_object('name', btrim(p_name), 'utm_campaign', v_cmp));
  ELSE
    -- Currency is fixed once spend exists: mixing currencies would corrupt totals.
    IF EXISTS (SELECT 1 FROM public.platform_ad_spend WHERE campaign_id = v_id)
       AND upper(p_currency) <> (SELECT currency FROM public.platform_campaigns WHERE id = v_id) THEN
      RAISE EXCEPTION 'Currency can''t change after spend is recorded';
    END IF;
    UPDATE public.platform_campaigns
       SET name = btrim(p_name), utm_source = v_src, utm_medium = v_med, utm_campaign = v_cmp,
           currency = upper(coalesce(p_currency, currency)), starts_on = p_starts_on, ends_on = p_ends_on,
           notes = coalesce(p_notes, ''), is_archived = coalesce(p_is_archived, is_archived)
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002'; END IF;
    PERFORM public.platform_audit('campaign.update', 'platform_campaign', v_id::text, jsonb_build_object('name', btrim(p_name), 'archived', p_is_archived));
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.platform_add_spend(p_campaign UUID, p_date DATE, p_amount_minor BIGINT, p_note TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM public.platform_require_owner();
  IF p_date IS NULL OR p_date > current_date + 1 THEN RAISE EXCEPTION 'Spend date can''t be in the future'; END IF;
  INSERT INTO public.platform_ad_spend (campaign_id, spend_date, amount_minor, note, created_by)
  VALUES (p_campaign, p_date, p_amount_minor, coalesce(btrim(p_note), ''), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.platform_audit('campaign.spend_add', 'platform_campaign', p_campaign::text,
    jsonb_build_object('spend_id', v_id, 'date', p_date, 'amount_minor', p_amount_minor));
  RETURN v_id;
END $$;

-- Manual entries only; an imported ('api') row is corrected at its source.
CREATE OR REPLACE FUNCTION public.platform_delete_spend(p_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.platform_ad_spend;
BEGIN
  PERFORM public.platform_require_owner();
  DELETE FROM public.platform_ad_spend WHERE id = p_id AND source = 'manual' RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Spend entry not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.platform_audit('campaign.spend_delete', 'platform_campaign', v_row.campaign_id::text,
    jsonb_build_object('spend_id', p_id, 'date', v_row.spend_date, 'amount_minor', v_row.amount_minor));
END $$;

-- Per campaign over [p_from, p_to] (null = no bound): spend, and requests whose
-- first or latest touch carries the campaign's tags, plus how many of the
-- first-touch requests were provisioned. Only real records; no estimates.
CREATE OR REPLACE FUNCTION public.platform_campaign_report(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS TABLE (
  campaign_id UUID, spend_minor BIGINT, requests_first BIGINT, requests_last BIGINT, provisioned_first BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_require_owner();
  RETURN QUERY
  WITH req AS (
    SELECT r.status, r.first_touch, r.last_touch FROM public.contact_requests r
     WHERE (p_from IS NULL OR r.created_at >= p_from::timestamptz)
       AND (p_to IS NULL OR r.created_at < (p_to + 1)::timestamptz)
  )
  SELECT c.id,
    coalesce((SELECT sum(s.amount_minor) FROM public.platform_ad_spend s
               WHERE s.campaign_id = c.id
                 AND (p_from IS NULL OR s.spend_date >= p_from)
                 AND (p_to IS NULL OR s.spend_date <= p_to)), 0)::bigint,
    (SELECT count(*) FROM req WHERE lower(req.first_touch->>'campaign') = c.utm_campaign
        AND (c.utm_source IS NULL OR lower(req.first_touch->>'source') = c.utm_source)),
    (SELECT count(*) FROM req WHERE lower(req.last_touch->>'campaign') = c.utm_campaign
        AND (c.utm_source IS NULL OR lower(req.last_touch->>'source') = c.utm_source)),
    (SELECT count(*) FROM req WHERE req.status = 'provisioned' AND lower(req.first_touch->>'campaign') = c.utm_campaign
        AND (c.utm_source IS NULL OR lower(req.first_touch->>'source') = c.utm_source))
  FROM public.platform_campaigns c;
END $$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'platform_save_campaign(uuid, text, text, text, text, char, date, date, text, boolean)',
    'platform_add_spend(uuid, date, bigint, text)',
    'platform_delete_spend(uuid)',
    'platform_campaign_report(date, date)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

COMMIT;
