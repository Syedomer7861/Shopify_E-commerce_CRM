-- Custom fields on built-in records (leads, deals, tickets, visits,
-- expenses, vendors, invoices, customers).
--
-- custom_field_defs: one row per field a workspace adds to a record type.
--   Readable by everyone in the workspace, written only by its admins.
--   Fields are archived (is_active = false), never deleted, so stored values
--   stay valid and visible in exports.
-- <table>.custom_fields JSONB: the values, on the record row itself, so the
--   record's own row security (can_reach etc.) governs them. A trigger
--   rejects keys the workspace never defined and values of the wrong type.
--   "Required" is enforced by the app form only, so imports, webhooks and
--   integrations that create records (Shopify, WhatsApp) never break.
--
-- Rollback:
--   DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY['leads','deals','tickets','visits','expenses','vendors','invoices','customers'] LOOP
--     EXECUTE format('DROP TRIGGER IF EXISTS trg_validate_custom_fields ON public.%I', t);
--     EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS custom_fields', t); END LOOP; END $$;
--   DROP FUNCTION IF EXISTS public.validate_custom_fields();
--   DROP TABLE IF EXISTS public.custom_field_defs;
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.custom_field_defs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity      TEXT NOT NULL CHECK (entity IN ('leads','deals','tickets','visits','expenses','vendors','invoices','customers')),
  key         TEXT NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label       TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  field_type  TEXT NOT NULL CHECK (field_type IN ('text','textarea','number','date','select')),
  options     TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(options) <= 50),
  required    BOOLEAN NOT NULL DEFAULT false,
  show_in_list BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, entity, key),
  CHECK (field_type <> 'select' OR cardinality(options) >= 1)
);
-- The key and type are fixed once created (stored values depend on them).
CREATE OR REPLACE FUNCTION public.custom_field_defs_freeze()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.key <> OLD.key OR NEW.field_type <> OLD.field_type OR NEW.entity <> OLD.entity OR NEW.org_id <> OLD.org_id THEN
    RAISE EXCEPTION 'A field''s key, type and record type cannot change. Archive it and add a new one.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_custom_field_defs_freeze ON public.custom_field_defs;
CREATE TRIGGER trg_custom_field_defs_freeze BEFORE UPDATE ON public.custom_field_defs
  FOR EACH ROW EXECUTE FUNCTION public.custom_field_defs_freeze();

ALTER TABLE public.custom_field_defs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.custom_field_defs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.custom_field_defs TO authenticated;
GRANT ALL ON public.custom_field_defs TO service_role;
DROP POLICY IF EXISTS cfd_read ON public.custom_field_defs;
CREATE POLICY cfd_read ON public.custom_field_defs FOR SELECT TO authenticated USING (org_id = public.current_org_id());
DROP POLICY IF EXISTS cfd_insert ON public.custom_field_defs;
CREATE POLICY cfd_insert ON public.custom_field_defs FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.is_admin());
DROP POLICY IF EXISTS cfd_update ON public.custom_field_defs;
CREATE POLICY cfd_update ON public.custom_field_defs FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.is_admin())
  WITH CHECK (org_id = public.current_org_id() AND public.is_admin());

CREATE OR REPLACE FUNCTION public.validate_custom_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  e RECORD;
  d public.custom_field_defs%ROWTYPE;
BEGIN
  IF NEW.custom_fields IS NULL OR NEW.custom_fields = '{}'::jsonb THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.custom_fields) <> 'object' OR pg_column_size(NEW.custom_fields) > 16384 THEN
    RAISE EXCEPTION 'Custom fields must be an object under 16 KB' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.custom_fields IS NOT DISTINCT FROM OLD.custom_fields THEN RETURN NEW; END IF;
  FOR e IN SELECT key, value FROM jsonb_each(NEW.custom_fields) LOOP
    SELECT * INTO d FROM public.custom_field_defs
     WHERE org_id = NEW.org_id AND entity = TG_TABLE_NAME AND key = e.key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown custom field "%"', e.key USING ERRCODE = '23514';
    END IF;
    CONTINUE WHEN jsonb_typeof(e.value) = 'null';
    IF d.field_type = 'number' AND jsonb_typeof(e.value) <> 'number' THEN
      RAISE EXCEPTION '% must be a number', d.label USING ERRCODE = '23514';
    ELSIF d.field_type <> 'number' AND jsonb_typeof(e.value) <> 'string' THEN
      RAISE EXCEPTION '% must be text', d.label USING ERRCODE = '23514';
    ELSIF d.field_type = 'date' AND (e.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION '% must be a date (YYYY-MM-DD)', d.label USING ERRCODE = '23514';
    ELSIF d.field_type = 'select' AND NOT ((e.value #>> '{}') = ANY (d.options)) THEN
      RAISE EXCEPTION '% must be one of its options', d.label USING ERRCODE = '23514';
    ELSIF d.field_type IN ('text','textarea') AND char_length(e.value #>> '{}') > 2000 THEN
      RAISE EXCEPTION '% is too long (2000 characters max)', d.label USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.validate_custom_fields(), public.custom_field_defs_freeze() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','deals','tickets','visits','expenses','vendors','invoices','customers'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT ''{}''', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_validate_custom_fields ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_validate_custom_fields BEFORE INSERT OR UPDATE OF custom_fields ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.validate_custom_fields()', t);
  END LOOP;
END $$;

COMMIT;
