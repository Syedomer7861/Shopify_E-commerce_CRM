-- Public pricing page, fully owner-controlled.
--
-- 1. subscription_plans gains highlights (short bullet list on the plan
--    card) and is_featured ("Most popular" badge). Description already exists.
-- 2. platform_pricing_rows: extra comparison rows the owner writes (users
--    included, support, onboarding...). Each row holds one cell per plan
--    code: 'yes', 'no' or short text. Modules per plan are NOT here; they
--    come from plan_modules (Super Admin > Modules), the same list that
--    actually switches modules on and off for paying workspaces.
--
-- The public page reads these on the server with the service key; only the
-- verified owner can read or write them from a browser.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.platform_delete_pricing_row(uuid);
--   DROP FUNCTION IF EXISTS public.platform_save_pricing_row(uuid, text, text, jsonb, int);
--   DROP FUNCTION IF EXISTS public.platform_set_plan_marketing(uuid, text, text[], boolean);
--   DROP TABLE IF EXISTS public.platform_pricing_rows;
--   ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS is_featured, DROP COLUMN IF EXISTS highlights;
-- Safe to re-run.

BEGIN;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS highlights  TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(highlights) <= 12),
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.platform_pricing_rows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section     TEXT NOT NULL DEFAULT 'Plan details' CHECK (char_length(btrim(section)) BETWEEN 1 AND 60),
  label       TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 120),
  plan_values JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(plan_values) = 'object' AND pg_column_size(plan_values) < 8192),
  sort_order  INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_pricing_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_pricing_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_pricing_rows TO authenticated;
GRANT ALL ON public.platform_pricing_rows TO service_role;
DROP POLICY IF EXISTS "platform_owner_read" ON public.platform_pricing_rows;
CREATE POLICY "platform_owner_read" ON public.platform_pricing_rows FOR SELECT TO authenticated USING (public.is_platform_owner_verified());

CREATE OR REPLACE FUNCTION public.platform_set_plan_marketing(p_plan UUID, p_description TEXT, p_highlights TEXT[], p_featured BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE clean TEXT[];
BEGIN
  PERFORM public.platform_require_owner();
  SELECT coalesce(array_agg(left(btrim(h), 140)), '{}') INTO clean FROM unnest(coalesce(p_highlights, '{}')) h WHERE btrim(h) <> '';
  UPDATE public.subscription_plans
     SET description = left(coalesce(p_description, ''), 2000), highlights = clean, is_featured = coalesce(p_featured, false)
   WHERE id = p_plan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002'; END IF;
  -- Only one featured plan.
  IF coalesce(p_featured, false) THEN
    UPDATE public.subscription_plans SET is_featured = false WHERE id <> p_plan AND is_featured;
  END IF;
  PERFORM public.platform_audit('plans.marketing', 'subscription_plans', p_plan::text, jsonb_build_object('featured', p_featured, 'highlights', cardinality(clean)));
END $$;

CREATE OR REPLACE FUNCTION public.platform_save_pricing_row(p_id UUID, p_section TEXT, p_label TEXT, p_values JSONB, p_sort INT)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id UUID := p_id;
BEGIN
  PERFORM public.platform_require_owner();
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_each(p_values) e WHERE jsonb_typeof(e.value) <> 'string' OR char_length(e.value #>> '{}') > 80) THEN
    RAISE EXCEPTION 'Each plan cell must be text up to 80 characters';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.platform_pricing_rows (section, label, plan_values, sort_order)
    VALUES (btrim(coalesce(nullif(btrim(p_section), ''), 'Plan details')), btrim(p_label), p_values, coalesce(p_sort, 0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.platform_pricing_rows SET section = btrim(coalesce(nullif(btrim(p_section), ''), 'Plan details')), label = btrim(p_label),
      plan_values = p_values, sort_order = coalesce(p_sort, sort_order), updated_at = now()
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Row not found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  PERFORM public.platform_audit('pricing.row_save', 'platform_pricing_rows', v_id::text, jsonb_build_object('label', btrim(p_label)));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.platform_delete_pricing_row(p_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_require_owner();
  DELETE FROM public.platform_pricing_rows WHERE id = p_id;
  PERFORM public.platform_audit('pricing.row_delete', 'platform_pricing_rows', p_id::text, '{}'::jsonb);
END $$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['platform_set_plan_marketing(uuid, text, text[], boolean)', 'platform_save_pricing_row(uuid, text, text, jsonb, int)', 'platform_delete_pricing_row(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

COMMIT;
