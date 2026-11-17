-- HR document designer templates (2026-11-18).
--
-- One row per designed document (payslip, offer letter, experience letter...).
-- `elements` is the canvas: an array of positioned blocks (text, image, line,
-- box, table) with {{placeholders}} filled from the employee at print time.
-- Owned by one organisation; only its admins and HR can see or change them.
-- Built-in starter designs live in code (src/lib/hr-docs.ts), so nothing
-- global is stored here and no org can touch another org's designs.
--
-- Additive. Rollback: DROP TABLE IF EXISTS public.hr_doc_templates;

BEGIN;

CREATE TABLE IF NOT EXISTS public.hr_doc_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  kind        text NOT NULL DEFAULT 'other' CHECK (kind IN ('payslip','offer_letter','appointment_letter','experience_letter','relieving_letter','salary_certificate','warning_letter','other')),
  page_size   text NOT NULL DEFAULT 'A4' CHECK (page_size IN ('A4','Letter')),
  elements    jsonb NOT NULL DEFAULT '[]'::jsonb
              CHECK (jsonb_typeof(elements) = 'array' AND jsonb_array_length(elements) <= 300 AND pg_column_size(elements) <= 2000000),
  created_by  uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_doc_templates_org_idx ON public.hr_doc_templates (org_id);

ALTER TABLE public.hr_doc_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_doc_templates FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_doc_templates TO authenticated;
GRANT ALL ON public.hr_doc_templates TO service_role;
DROP POLICY IF EXISTS hr_manage ON public.hr_doc_templates;
CREATE POLICY hr_manage ON public.hr_doc_templates FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_role('hr')))
  WITH CHECK (org_id = public.current_org_id() AND (public.is_admin() OR public.has_role('hr')));

COMMIT;
