-- Fix for 20261113i: platform_set_plan_modules wrote 'all' as jsonb, which is not valid JSON.
-- Only the function body changes; the 20261113i file carries the same fix for fresh installs.
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
