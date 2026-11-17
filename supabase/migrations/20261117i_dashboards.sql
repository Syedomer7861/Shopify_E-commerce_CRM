-- Configurable dashboards: templates, drafts, published versions, assignment.
--
-- dashboards              org_id NULL = global template (platform owner only,
--                         with a verified session); org_id = an organisation's
--                         own dashboard. `layout` is the draft being edited,
--                         `published_layout` what people see.
-- dashboard_versions      one immutable row per publish (no update/delete).
-- dashboard_assignments   which published dashboard a role / branch /
--                         department / designation / employee gets. Most
--                         specific wins: employee > designation > department
--                         > branch > role.
--
-- A dashboard only picks which widgets appear. Each widget still checks the
-- viewer's permissions and reads through RLS, so assignment never grants
-- access to data.
--
-- Additive only. Rollback:
--   DROP FUNCTION IF EXISTS public.my_dashboard(), public.dashboard_publish(uuid, text),
--     public.dashboard_restore(uuid, int), public.dashboard_copy(uuid, text);
--   DROP TABLE IF EXISTS public.dashboard_assignments, public.dashboard_versions, public.dashboards;
BEGIN;

CREATE TABLE IF NOT EXISTS public.dashboards (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description         text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  category            text NOT NULL DEFAULT 'General' CHECK (char_length(category) BETWEEN 1 AND 60),
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  layout              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(layout) = 'array' AND jsonb_array_length(layout) <= 40),
  published_layout    jsonb CHECK (published_layout IS NULL OR (jsonb_typeof(published_layout) = 'array' AND jsonb_array_length(published_layout) <= 40)),
  version             int NOT NULL DEFAULT 0,
  source_dashboard_id uuid REFERENCES public.dashboards(id) ON DELETE SET NULL,
  created_by          uuid DEFAULT auth.uid(),
  updated_by          uuid DEFAULT auth.uid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboards_org ON public.dashboards (org_id, status);

CREATE TABLE IF NOT EXISTS public.dashboard_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  org_id       uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  version      int NOT NULL,
  layout       jsonb NOT NULL,
  note         text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  published_by uuid DEFAULT auth.uid(),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dashboard_id, version)
);

CREATE TABLE IF NOT EXISTS public.dashboard_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  dashboard_id uuid NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  target_type  text NOT NULL CHECK (target_type IN ('role','branch','department','designation','employee')),
  target_key   text NOT NULL CHECK (char_length(target_key) BETWEEN 1 AND 80),
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, target_type, target_key)
);
CREATE INDEX IF NOT EXISTS dashboard_assignments_dashboard ON public.dashboard_assignments (dashboard_id);

-- Integrity: assignments point at the same org's dashboard; touch updated_*.
CREATE OR REPLACE FUNCTION public.dashboard_assignment_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dashboards WHERE id = NEW.dashboard_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'Dashboard belongs to another organisation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dashboard_assignments_check ON public.dashboard_assignments;
CREATE TRIGGER dashboard_assignments_check BEFORE INSERT OR UPDATE ON public.dashboard_assignments
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_assignment_check();

CREATE OR REPLACE FUNCTION public.dashboard_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now(); NEW.updated_by := auth.uid();
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN RAISE EXCEPTION 'Dashboard owner cannot change' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dashboards_touch ON public.dashboards;
CREATE TRIGGER dashboards_touch BEFORE UPDATE ON public.dashboards FOR EACH ROW EXECUTE FUNCTION public.dashboard_touch();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dashboards','dashboard_versions','dashboard_assignments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', 'trg_audit_' || t, t);
  END LOOP;
END $$;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_assignments ENABLE ROW LEVEL SECURITY;

-- Everyone in an org reads its dashboards (they need theirs to render it);
-- global templates are readable once published; the owner sees all globals.
DROP POLICY IF EXISTS dashboards_read ON public.dashboards;
CREATE POLICY dashboards_read ON public.dashboards FOR SELECT TO authenticated USING (
  org_id = public.current_org_id()
  OR (org_id IS NULL AND (status = 'published' OR public.is_platform_owner_verified())));
DROP POLICY IF EXISTS dashboards_org_write ON public.dashboards;
CREATE POLICY dashboards_org_write ON public.dashboards FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('organisation','manage')))
  WITH CHECK (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('organisation','manage')));
DROP POLICY IF EXISTS dashboards_global_write ON public.dashboards;
CREATE POLICY dashboards_global_write ON public.dashboards FOR ALL TO authenticated
  USING (org_id IS NULL AND public.is_platform_owner_verified())
  WITH CHECK (org_id IS NULL AND public.is_platform_owner_verified());

DROP POLICY IF EXISTS dashboard_versions_read ON public.dashboard_versions;
CREATE POLICY dashboard_versions_read ON public.dashboard_versions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.dashboards d WHERE d.id = dashboard_id));
DROP POLICY IF EXISTS dashboard_versions_insert ON public.dashboard_versions;
CREATE POLICY dashboard_versions_insert ON public.dashboard_versions FOR INSERT TO authenticated WITH CHECK (
  (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('organisation','manage')))
  OR (org_id IS NULL AND public.is_platform_owner_verified()));

DROP POLICY IF EXISTS dashboard_assignments_read ON public.dashboard_assignments;
CREATE POLICY dashboard_assignments_read ON public.dashboard_assignments FOR SELECT TO authenticated USING (
  org_id = public.current_org_id());
DROP POLICY IF EXISTS dashboard_assignments_write ON public.dashboard_assignments;
CREATE POLICY dashboard_assignments_write ON public.dashboard_assignments FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('organisation','manage')))
  WITH CHECK (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('organisation','manage')));

-- ── Functions (SECURITY INVOKER: RLS decides) ──────────────────────────────
-- Publish the draft: new immutable version row, published_layout updated.
CREATE OR REPLACE FUNCTION public.dashboard_publish(p_id uuid, p_note text)
RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE d dashboards%ROWTYPE; n int;
BEGIN
  SELECT * INTO d FROM dashboards WHERE id = p_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Dashboard not found' USING ERRCODE = '42501'; END IF;
  IF d.status = 'archived' THEN RAISE EXCEPTION 'Restore the dashboard before publishing'; END IF;
  IF jsonb_array_length(d.layout) = 0 THEN RAISE EXCEPTION 'Add at least one widget before publishing'; END IF;
  UPDATE dashboards SET published_layout = layout, version = version + 1, status = 'published' WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Not allowed to publish this dashboard' USING ERRCODE = '42501'; END IF;
  INSERT INTO dashboard_versions (dashboard_id, org_id, version, layout, note)
  VALUES (p_id, d.org_id, d.version + 1, d.layout, coalesce(left(p_note, 300), ''));
  RETURN d.version + 1;
END $$;

-- Load a published version back into the draft (publishing stays a separate step).
CREATE OR REPLACE FUNCTION public.dashboard_restore(p_id uuid, p_version int)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE l jsonb; n int;
BEGIN
  SELECT layout INTO l FROM dashboard_versions WHERE dashboard_id = p_id AND version = p_version;
  IF l IS NULL THEN RAISE EXCEPTION 'Version not found'; END IF;
  UPDATE dashboards SET layout = l WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Not allowed to edit this dashboard' USING ERRCODE = '42501'; END IF;
END $$;

-- Copy a global template or one of the org's dashboards into a new org draft.
CREATE OR REPLACE FUNCTION public.dashboard_copy(p_source uuid, p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE s dashboards%ROWTYPE; nid uuid := gen_random_uuid(); org uuid := public.current_org_id();
BEGIN
  IF org IS NULL THEN RAISE EXCEPTION 'No organisation' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM dashboards WHERE id = p_source;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Dashboard not found' USING ERRCODE = '42501'; END IF;
  INSERT INTO dashboards (id, org_id, name, description, category, layout, source_dashboard_id)
  VALUES (nid, org, coalesce(nullif(btrim(p_name), ''), s.name), s.description, s.category,
          coalesce(s.published_layout, s.layout), p_source);
  RETURN nid;
END $$;

-- The caller's published dashboard, most specific assignment first. NULL
-- when nothing is assigned (the app falls back to the role's widget list).
CREATE OR REPLACE FUNCTION public.my_dashboard()
RETURNS TABLE (id uuid, name text, layout jsonb, matched text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT d.id, d.name, d.published_layout, a.target_type
    FROM profiles p
    JOIN dashboard_assignments a ON a.org_id = p.org_id AND (
         (a.target_type = 'employee' AND a.target_key = p.id::text)
      OR (a.target_type = 'designation' AND a.target_key = p.designation_id::text)
      OR (a.target_type = 'department' AND a.target_key = p.department_id::text)
      OR (a.target_type = 'branch' AND a.target_key = p.branch_id::text)
      OR (a.target_type = 'role' AND a.target_key = p.role))
    JOIN dashboards d ON d.id = a.dashboard_id AND d.status = 'published' AND d.published_layout IS NOT NULL
   WHERE p.id = auth.uid()
   ORDER BY array_position(ARRAY['employee','designation','department','branch','role'], a.target_type)
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_publish(uuid, text), public.dashboard_restore(uuid, int),
  public.dashboard_copy(uuid, text), public.my_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_publish(uuid, text), public.dashboard_restore(uuid, int),
  public.dashboard_copy(uuid, text), public.my_dashboard() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.dashboard_assignment_check() FROM PUBLIC, anon, authenticated;

-- ── Global starter templates (widget keys from the app's widget registry) ──
-- Configuration only, no business data. Each widget hides itself for anyone
-- without access, so a template never shows more than the viewer may see.
INSERT INTO public.dashboards (org_id, name, description, category, status, layout, published_layout, version, created_by, updated_by)
SELECT NULL, t.name, t.description, t.category, 'published', t.layout, t.layout, 1, NULL, NULL
  FROM (VALUES
    ('Team member', 'Own work, tasks assigned to me, approvals, KPI score and announcements.', 'General',
     '[{"id":"w1","widget":"my-work","size":"full"},{"id":"w2","widget":"assigned-tasks","size":"m"},{"id":"w3","widget":"approvals","size":"m"},{"id":"w4","widget":"kpi-scorecard","size":"full"},{"id":"w5","widget":"announcements","size":"full"}]'::jsonb),
    ('Developer', 'Projects and deadlines, live GitHub / Vercel / Supabase feed, assigned tasks, KPI score.', 'Technology',
     '[{"id":"w1","widget":"my-work","size":"full"},{"id":"w2","widget":"dev-tools","size":"full"},{"id":"w3","widget":"assigned-tasks","size":"m"},{"id":"w4","widget":"kpi-scorecard","size":"full"}]'::jsonb),
    ('Sales', 'Leads, deals and orders counts, assigned tasks and KPI score.', 'Sales',
     '[{"id":"w1","widget":"pulse","size":"full"},{"id":"w2","widget":"orders","size":"full"},{"id":"w3","widget":"assigned-tasks","size":"m"},{"id":"w4","widget":"kpi-scorecard","size":"full"}]'::jsonb),
    ('Customer support', 'Ticket counts, assigned tasks, approvals and KPI score.', 'Support',
     '[{"id":"w1","widget":"pulse","size":"full"},{"id":"w2","widget":"assigned-tasks","size":"m"},{"id":"w3","widget":"approvals","size":"m"},{"id":"w4","widget":"kpi-scorecard","size":"full"}]'::jsonb),
    ('Manager / department head', 'Module counts, approvals waiting, team work and announcements.', 'Management',
     '[{"id":"w1","widget":"pulse","size":"full"},{"id":"w2","widget":"approvals","size":"m"},{"id":"w3","widget":"assigned-tasks","size":"m"},{"id":"w4","widget":"my-work","size":"full"},{"id":"w5","widget":"announcements","size":"full"}]'::jsonb),
    ('HR', 'Organisation snapshot, approvals, announcements and assigned tasks.', 'Human resources',
     '[{"id":"w1","widget":"org-snapshot","size":"full"},{"id":"w2","widget":"approvals","size":"m"},{"id":"w3","widget":"assigned-tasks","size":"m"},{"id":"w4","widget":"announcements","size":"full"}]'::jsonb),
    ('Finance', 'Claims and invoices counts, orders and revenue, approvals.', 'Finance',
     '[{"id":"w1","widget":"pulse","size":"full"},{"id":"w2","widget":"orders","size":"full"},{"id":"w3","widget":"approvals","size":"m"}]'::jsonb)
  ) AS t(name, description, category, layout)
 WHERE NOT EXISTS (SELECT 1 FROM public.dashboards WHERE org_id IS NULL);
INSERT INTO public.dashboard_versions (dashboard_id, org_id, version, layout, note, published_by)
SELECT id, NULL, 1, layout, 'Starter template', NULL FROM public.dashboards
 WHERE org_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.dashboard_versions v WHERE v.dashboard_id = dashboards.id);

COMMIT;
