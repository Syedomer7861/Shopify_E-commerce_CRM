-- Industry templates: ready-made custom fields a workspace admin can apply
-- in one click (Settings > Custom Fields). Templates are data, not code:
-- the platform owner adds or edits rows here; applying one only inserts
-- custom_field_defs the workspace doesn't already have (never overwrites).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.apply_industry_template(text);
--   DROP TABLE IF EXISTS public.industry_templates;
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.industry_templates (
  code        TEXT PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 300),
  fields      JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(fields) = 'array' AND jsonb_array_length(fields) <= 60),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0
);
ALTER TABLE public.industry_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.industry_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.industry_templates TO authenticated;
GRANT ALL ON public.industry_templates TO service_role;
DROP POLICY IF EXISTS it_read ON public.industry_templates;
CREATE POLICY it_read ON public.industry_templates FOR SELECT TO authenticated USING (is_active);

CREATE OR REPLACE FUNCTION public.apply_industry_template(p_code TEXT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  o UUID := public.current_org_id();
  t public.industry_templates%ROWTYPE;
  added INT;
BEGIN
  IF o IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Only workspace admins can apply a template' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.industry_templates WHERE code = p_code AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0002'; END IF;
  WITH f AS (
    SELECT x.value AS v, x.ordinality AS n FROM jsonb_array_elements(t.fields) WITH ORDINALITY x
  ), ins AS (
    INSERT INTO public.custom_field_defs (org_id, entity, key, label, field_type, options, show_in_list, sort_order)
    SELECT o, v->>'entity', v->>'key', v->>'label', v->>'field_type',
           coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v->'options', '[]'))), '{}'),
           coalesce((v->>'show_in_list')::boolean, false), 100 + n
      FROM f
    ON CONFLICT (org_id, entity, key) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO added FROM ins;
  RETURN added;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_industry_template(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_industry_template(text) TO authenticated;

INSERT INTO public.industry_templates (code, name, description, fields, sort_order) VALUES
('education', 'Education and coaching', 'Admissions enquiries for schools, colleges, coaching and training institutes.', '[
  {"entity":"leads","key":"course","label":"Course of interest","field_type":"text","show_in_list":true},
  {"entity":"leads","key":"student_name","label":"Student name","field_type":"text"},
  {"entity":"leads","key":"current_class","label":"Current class or qualification","field_type":"text"},
  {"entity":"leads","key":"batch","label":"Preferred batch","field_type":"select","options":["Morning","Afternoon","Evening","Weekend","Online"]},
  {"entity":"leads","key":"counselling_date","label":"Counselling date","field_type":"date"},
  {"entity":"deals","key":"fee_plan","label":"Fee plan","field_type":"select","options":["Full payment","Instalments","Scholarship"]},
  {"entity":"deals","key":"admission_date","label":"Admission date","field_type":"date"}
]', 10),
('real_estate', 'Real estate', 'Buyer and tenant enquiries for brokers, builders and property managers.', '[
  {"entity":"leads","key":"property_type","label":"Property type","field_type":"select","options":["Apartment","Villa","Plot","Commercial","Office"],"show_in_list":true},
  {"entity":"leads","key":"purpose","label":"Purpose","field_type":"select","options":["Buy","Rent","Invest"]},
  {"entity":"leads","key":"budget","label":"Budget (₹)","field_type":"number"},
  {"entity":"leads","key":"preferred_location","label":"Preferred location","field_type":"text","show_in_list":true},
  {"entity":"leads","key":"bhk","label":"Bedrooms","field_type":"select","options":["1","2","3","4","5+"]},
  {"entity":"deals","key":"site_visit_date","label":"Site visit date","field_type":"date"},
  {"entity":"deals","key":"unit_number","label":"Unit or plot number","field_type":"text"}
]', 20),
('healthcare', 'Clinics and healthcare', 'Patient enquiries and follow-ups for clinics, diagnostics and wellness centres.', '[
  {"entity":"leads","key":"concern","label":"Health concern","field_type":"text","show_in_list":true},
  {"entity":"leads","key":"preferred_doctor","label":"Preferred doctor","field_type":"text"},
  {"entity":"leads","key":"appointment_date","label":"Appointment date","field_type":"date","show_in_list":true},
  {"entity":"leads","key":"age","label":"Age","field_type":"number"},
  {"entity":"tickets","key":"patient_id","label":"Patient ID","field_type":"text"}
]', 30),
('services', 'Agencies and professional services', 'Clients and projects for agencies, consultants and service firms.', '[
  {"entity":"leads","key":"service_needed","label":"Service needed","field_type":"text","show_in_list":true},
  {"entity":"leads","key":"budget","label":"Budget (₹)","field_type":"number"},
  {"entity":"leads","key":"timeline","label":"Timeline","field_type":"select","options":["Urgent","This month","This quarter","Exploring"]},
  {"entity":"deals","key":"contract_type","label":"Contract type","field_type":"select","options":["One-time","Monthly retainer","Annual"]},
  {"entity":"deals","key":"start_date","label":"Start date","field_type":"date"}
]', 40),
('retail', 'Retail and distribution', 'Dealers, distributors and bulk buyers for retail and wholesale businesses.', '[
  {"entity":"leads","key":"business_type","label":"Business type","field_type":"select","options":["Retailer","Distributor","Wholesaler","Institution"],"show_in_list":true},
  {"entity":"leads","key":"city","label":"City","field_type":"text","show_in_list":true},
  {"entity":"leads","key":"gstin","label":"GSTIN","field_type":"text"},
  {"entity":"deals","key":"order_frequency","label":"Order frequency","field_type":"select","options":["Weekly","Monthly","Quarterly","One-time"]},
  {"entity":"visits","key":"stock_check","label":"Stock check notes","field_type":"textarea"}
]', 50)
ON CONFLICT (code) DO NOTHING;

COMMIT;
