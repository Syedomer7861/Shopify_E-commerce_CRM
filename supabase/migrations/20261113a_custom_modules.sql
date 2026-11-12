-- Apps: modules an organisation's admin builds without code.
--
-- An admin defines a module (its fields, statuses and who may see its
-- records) on the Apps page; every member then gets a list, a form and an
-- export for it. This is what lets one product fit an agency, a clinic, a
-- school or a factory: the organisation models its own work instead of
-- waiting for a module to be coded.
--
--   custom_modules  - the definition (one row per app)
--   custom_records  - the data (one row per record, values in `data`)
--
-- Row security, both tables:
--   - nothing crosses organisations (org_id = current_org_id() on every policy)
--   - only an admin creates, changes or archives a module
--   - records: each member creates their own; sees their own always, and
--     everyone's when the module's visibility is 'everyone'; edits their own;
--     an admin sees, edits and deletes all
--
-- Additive: touches no existing table. Requires 20261105 (tenancy),
-- 20260822 (is_admin) and 20261111f (people_in_org). Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS custom_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  key         VARCHAR(40)  NOT NULL CHECK (key ~ '^[a-z][a-z0-9-]{1,39}$'),
  label       VARCHAR(60)  NOT NULL,
  noun        VARCHAR(40)  NOT NULL,
  description TEXT,
  -- [{ key, label, type: text|number|date|textarea|select, required?, options? }]
  fields      JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(fields) = 'array' AND jsonb_array_length(fields) BETWEEN 1 AND 30),
  statuses    TEXT[] NOT NULL DEFAULT '{open,done}' CHECK (cardinality(statuses) BETWEEN 1 AND 12),
  visibility  VARCHAR(10) NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone', 'own')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

CREATE TABLE IF NOT EXISTS custom_records (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  module_id  UUID NOT NULL REFERENCES custom_modules(id) ON DELETE CASCADE,
  data       JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object' AND pg_column_size(data) < 20000),
  status     VARCHAR(40) NOT NULL DEFAULT 'open',
  owner_id   UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_modules_org ON custom_modules(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_custom_records_module ON custom_records(module_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_records_owner ON custom_records(owner_id);

-- A record always belongs to the organisation of its module, whatever the client sent.
CREATE OR REPLACE FUNCTION public.custom_records_before_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m custom_modules%ROWTYPE;
BEGIN
  SELECT * INTO m FROM custom_modules WHERE id = NEW.module_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'That app does not exist.'; END IF;
  IF TG_OP = 'INSERT' AND NOT m.is_active THEN RAISE EXCEPTION 'That app is archived.'; END IF;
  NEW.org_id := m.org_id;
  IF NOT (NEW.status = ANY (m.statuses)) THEN
    IF TG_OP = 'INSERT' THEN NEW.status := m.statuses[1];
    ELSE RAISE EXCEPTION 'Status must be one of: %', array_to_string(m.statuses, ', ');
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.module_id := OLD.module_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_custom_records_before_write ON custom_records;
CREATE TRIGGER trg_custom_records_before_write BEFORE INSERT OR UPDATE ON custom_records
  FOR EACH ROW EXECUTE FUNCTION public.custom_records_before_write();

DROP TRIGGER IF EXISTS trg_custom_records_people ON custom_records;
CREATE TRIGGER trg_custom_records_people BEFORE INSERT OR UPDATE ON custom_records
  FOR EACH ROW EXECUTE FUNCTION public.people_in_org('owner_id');

ALTER TABLE custom_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_modules_read ON custom_modules;
CREATE POLICY custom_modules_read ON custom_modules FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
DROP POLICY IF EXISTS custom_modules_create ON custom_modules;
CREATE POLICY custom_modules_create ON custom_modules FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.is_admin());
DROP POLICY IF EXISTS custom_modules_edit ON custom_modules;
CREATE POLICY custom_modules_edit ON custom_modules FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.is_admin())
  WITH CHECK (org_id = public.current_org_id() AND public.is_admin());
DROP POLICY IF EXISTS custom_modules_delete ON custom_modules;
CREATE POLICY custom_modules_delete ON custom_modules FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.is_admin());

DROP POLICY IF EXISTS custom_records_read ON custom_records;
CREATE POLICY custom_records_read ON custom_records FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (
      owner_id = auth.uid()
      OR public.is_admin()
      OR EXISTS (SELECT 1 FROM custom_modules m WHERE m.id = module_id AND m.org_id = public.current_org_id() AND m.visibility = 'everyone')
    )
  );
DROP POLICY IF EXISTS custom_records_create ON custom_records;
CREATE POLICY custom_records_create ON custom_records FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND owner_id = auth.uid()
    AND EXISTS (SELECT 1 FROM custom_modules m WHERE m.id = module_id AND m.org_id = public.current_org_id() AND m.is_active)
  );
DROP POLICY IF EXISTS custom_records_edit ON custom_records;
CREATE POLICY custom_records_edit ON custom_records FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND (owner_id = auth.uid() OR public.is_admin()))
  WITH CHECK (org_id = public.current_org_id() AND (owner_id = auth.uid() OR public.is_admin()));
DROP POLICY IF EXISTS custom_records_delete ON custom_records;
CREATE POLICY custom_records_delete ON custom_records FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.is_admin());

COMMIT;
