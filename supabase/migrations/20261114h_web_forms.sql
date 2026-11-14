-- Web forms (web-to-lead). A workspace admin builds a form; anyone can fill
-- it in at /f/<id> or in an iframe on their own site; each submission
-- becomes a lead in that workspace.
--
-- web_forms is read by workspace members and written only by admins (RLS).
-- Public submissions never touch the table directly: the server route
-- (rate-limited, honeypot) calls submit_web_form() with the service key.
-- The function refuses inactive forms, suspended or unpaid workspaces, and
-- workspaces where Leads is switched off; sets org_id explicitly (a service
-- insert has no session for the column default); keeps only the fields the
-- form asks for; and custom-field values still pass the validation trigger.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.submit_web_form(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.web_form_public(uuid);
--   DROP TABLE IF EXISTS public.web_forms;
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.web_forms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  title           TEXT NOT NULL DEFAULT 'Get in touch' CHECK (char_length(title) <= 120),
  intro           TEXT NOT NULL DEFAULT '' CHECK (char_length(intro) <= 500),
  -- Built-in keys (email, phone, company, notes) and custom lead fields as 'cf:<key>'. Name is always asked.
  fields          TEXT[] NOT NULL DEFAULT '{email,phone}' CHECK (cardinality(fields) <= 30),
  source          TEXT NOT NULL DEFAULT 'Website form' CHECK (char_length(btrim(source)) BETWEEN 1 AND 60),
  assign_to       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  success_message TEXT NOT NULL DEFAULT 'Thank you. We will get back to you soon.' CHECK (char_length(success_message) <= 300),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  submissions     INT NOT NULL DEFAULT 0,
  last_submission_at TIMESTAMPTZ,
  created_by      UUID DEFAULT auth.uid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.web_forms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_forms FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_forms TO authenticated;
GRANT ALL ON public.web_forms TO service_role;
DROP POLICY IF EXISTS wf_read ON public.web_forms;
CREATE POLICY wf_read ON public.web_forms FOR SELECT TO authenticated USING (org_id = public.current_org_id());
DROP POLICY IF EXISTS wf_write ON public.web_forms;
CREATE POLICY wf_write ON public.web_forms FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_admin())
  WITH CHECK (org_id = public.current_org_id() AND public.is_admin());

-- A form may only assign leads to someone in its own workspace.
CREATE OR REPLACE FUNCTION public.web_forms_check_assignee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.assign_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.assign_to AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'Leads can only be assigned to someone in this workspace' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_web_forms_check_assignee ON public.web_forms;
CREATE TRIGGER trg_web_forms_check_assignee BEFORE INSERT OR UPDATE OF assign_to, org_id ON public.web_forms
  FOR EACH ROW EXECUTE FUNCTION public.web_forms_check_assignee();

-- What the public form page needs, and nothing else. NULL when not live.
CREATE OR REPLACE FUNCTION public.web_form_public(p_form UUID)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'title', f.title, 'intro', f.intro, 'success_message', f.success_message, 'org_name', o.name,
    'fields', (SELECT coalesce(jsonb_agg(x.k ORDER BY x.n), '[]') FROM unnest(f.fields) WITH ORDINALITY x(k, n)),
    'custom', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', d.key, 'label', d.label, 'field_type', d.field_type, 'options', d.options, 'required', d.required)), '[]')
                 FROM public.custom_field_defs d
                WHERE d.org_id = f.org_id AND d.entity = 'leads' AND d.is_active AND ('cf:' || d.key) = ANY (f.fields)))
  FROM public.web_forms f JOIN public.organizations o ON o.id = f.org_id
  WHERE f.id = p_form AND f.is_active AND o.is_active AND NOT coalesce(o.billing_hold, false)
    AND NOT ('leads' = ANY (coalesce(o.platform_blocked_modules, '{}') || coalesce(o.disabled_modules, '{}')))
$$;

CREATE OR REPLACE FUNCTION public.submit_web_form(p_form UUID, p_data JSONB)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f public.web_forms%ROWTYPE;
  v_name TEXT := left(btrim(coalesce(p_data->>'name', '')), 120);
  v_custom JSONB := '{}';
  v_lead UUID := gen_random_uuid();
  k TEXT;
BEGIN
  IF public.web_form_public(p_form) IS NULL THEN RAISE EXCEPTION 'This form is not accepting responses' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO f FROM public.web_forms WHERE id = p_form;
  IF v_name = '' THEN RAISE EXCEPTION 'Name is required' USING ERRCODE = '23514'; END IF;
  FOREACH k IN ARRAY f.fields LOOP
    IF k LIKE 'cf:%' AND p_data ? k AND btrim(coalesce(p_data->>k, '')) <> '' THEN
      v_custom := v_custom || jsonb_build_object(substr(k, 4), p_data->k);
    END IF;
  END LOOP;
  INSERT INTO public.leads (id, org_id, owner_id, name, email, phone, company, notes, source, status, custom_fields)
  VALUES (v_lead, f.org_id, f.assign_to, v_name,
    CASE WHEN 'email' = ANY (f.fields) THEN nullif(left(btrim(p_data->>'email'), 200), '') END,
    CASE WHEN 'phone' = ANY (f.fields) THEN nullif(left(btrim(p_data->>'phone'), 40), '') END,
    CASE WHEN 'company' = ANY (f.fields) THEN nullif(left(btrim(p_data->>'company'), 160), '') END,
    CASE WHEN 'notes' = ANY (f.fields) THEN nullif(left(btrim(p_data->>'notes'), 4000), '') END,
    f.source, 'new', v_custom);
  UPDATE public.web_forms SET submissions = submissions + 1, last_submission_at = now() WHERE id = f.id;
  RETURN jsonb_build_object('lead_id', v_lead, 'org_id', f.org_id, 'assign_to', f.assign_to, 'form_name', f.name, 'success_message', f.success_message);
END $$;

REVOKE EXECUTE ON FUNCTION public.web_form_public(uuid), public.submit_web_form(uuid, jsonb), public.web_forms_check_assignee() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_form_public(uuid), public.submit_web_form(uuid, jsonb) TO service_role;

COMMIT;
