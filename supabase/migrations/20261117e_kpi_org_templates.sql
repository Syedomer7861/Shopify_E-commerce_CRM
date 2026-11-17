-- KPI engine, phase 3: organisation templates.
--
-- kpi_adopt_template(source)      copies a published global template into the
--                                 caller's organisation. The copy shares the
--                                 global family_id and records source id +
--                                 version, so "new version available" is a
--                                 simple family/version compare. Adopting a
--                                 newer version archives the org's older copy;
--                                 plans keep their own items and don't change.
-- kpi_save_org_template(id, p)    create or edit an org template and replace
--                                 its items in one transaction.
-- platform_kpi_usage()            owner only: organisations using each global
--                                 template.
--
-- The two org functions are SECURITY INVOKER: the caller's RLS decides
-- (kpi.manage or admin, own organisation only). Ids are generated here, so
-- no INSERT ... RETURNING depends on the SELECT policy.
--
-- Additive only. Rollback:
--   DROP FUNCTION IF EXISTS public.kpi_adopt_template(uuid), public.kpi_save_org_template(uuid, jsonb), public.platform_kpi_usage();

BEGIN;

CREATE OR REPLACE FUNCTION public.kpi_save_org_template(p_id uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE tid uuid := coalesce(p_id, gen_random_uuid()); it jsonb; i int := 0; org uuid := public.current_org_id(); n int;
BEGIN
  IF org IS NULL THEN RAISE EXCEPTION 'No organisation' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO kpi_templates (id, org_id, name, collection, description, department_hint, designation_hints, industry, period, status)
    VALUES (tid, org, p->>'name', coalesce(p->>'collection',''), coalesce(p->>'description',''), p->>'department_hint',
            coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'designation_hints')), '{}'), p->>'industry',
            coalesce(p->>'period','monthly'), coalesce(p->>'status','published'));
  ELSE
    UPDATE kpi_templates SET name = p->>'name', collection = coalesce(p->>'collection',''), description = coalesce(p->>'description',''),
      department_hint = p->>'department_hint', designation_hints = coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'designation_hints')), '{}'),
      industry = p->>'industry', period = coalesce(p->>'period','monthly')
    WHERE id = tid AND org_id = org;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RAISE EXCEPTION 'Template not found or not allowed' USING ERRCODE = '42501'; END IF;
    DELETE FROM kpi_template_items WHERE template_id = tid;
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) LOOP
    i := i + 1;
    INSERT INTO kpi_template_items (template_id, name, description, source_key, measurement, direction, unit,
      default_target, weight, cap, threshold, missing_rule, sort_order)
    VALUES (tid, it->>'name', coalesce(it->>'description',''), nullif(it->>'source_key',''), it->>'measurement',
      coalesce(it->>'direction','higher'), coalesce(it->>'unit',''), (it->>'default_target')::numeric,
      coalesce((it->>'weight')::numeric, 0), (it->>'cap')::numeric, (it->>'threshold')::numeric,
      coalesce(it->>'missing_rule','exclude'), i);
  END LOOP;
  RETURN tid;
END $$;

CREATE OR REPLACE FUNCTION public.kpi_adopt_template(p_source uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE src kpi_templates%ROWTYPE; nid uuid := gen_random_uuid(); nver int; org uuid := public.current_org_id();
BEGIN
  IF org IS NULL THEN RAISE EXCEPTION 'No organisation' USING ERRCODE = '42501'; END IF;
  -- RLS: only published, visible global templates are readable here.
  SELECT * INTO src FROM kpi_templates WHERE id = p_source AND org_id IS NULL AND status = 'published';
  IF src.id IS NULL THEN RAISE EXCEPTION 'Template not available'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO nver FROM kpi_templates WHERE org_id = org AND family_id = src.family_id;
  INSERT INTO kpi_templates (id, org_id, family_id, version, source_template_id, source_version, name, collection, description,
    department_hint, designation_hints, industry, period, status)
  VALUES (nid, org, src.family_id, nver, src.id, src.version, src.name, src.collection, src.description,
    src.department_hint, src.designation_hints, src.industry, src.period, 'published');
  INSERT INTO kpi_template_items (template_id, name, description, source_key, measurement, direction, unit, default_target, weight, cap, threshold, missing_rule, sort_order)
  SELECT nid, name, description, source_key, measurement, direction, unit, default_target, weight, cap, threshold, missing_rule, sort_order
    FROM kpi_template_items WHERE template_id = src.id;
  UPDATE kpi_templates SET status = 'archived'
   WHERE org_id = org AND family_id = src.family_id AND id <> nid AND status <> 'archived';
  RETURN nid;
END $$;

REVOKE EXECUTE ON FUNCTION public.kpi_save_org_template(uuid, jsonb), public.kpi_adopt_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_save_org_template(uuid, jsonb), public.kpi_adopt_template(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_kpi_usage()
RETURNS TABLE (template_id uuid, orgs bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_require_owner();
  RETURN QUERY SELECT t.source_template_id, count(DISTINCT t.org_id)
    FROM kpi_templates t WHERE t.org_id IS NOT NULL AND t.source_template_id IS NOT NULL AND t.status <> 'archived'
    GROUP BY t.source_template_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_kpi_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_kpi_usage() TO authenticated;

COMMIT;
