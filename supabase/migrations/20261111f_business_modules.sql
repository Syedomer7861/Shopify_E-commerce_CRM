-- Phase 6 of the platform plan: the new business modules.
--   Finance      - vendors, invoices (expenses already exist; Phase 4 wired them)
--   Service Desk - tickets with SLA clocks
--   Sales        - leads, deals
--   Field Force  - territories, visits (location only with the employee's consent)
--
-- Every table is org-scoped and every policy goes through the permission
-- engine (can_reach / has_perm from 20261111c), so who sees what is set on
-- the Roles page, not here. Nothing here touches customers, orders, the
-- call queue, Shopify, WhatsApp or shipping.
--
-- Additive. Requires 20261111b, c, d and e.

CREATE TABLE IF NOT EXISTS vendors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  name         VARCHAR(160) NOT NULL,
  contact_name VARCHAR(160),
  phone        VARCHAR(30),
  email        VARCHAR(160),
  tax_id       VARCHAR(40),
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS invoices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  number      VARCHAR(60) NOT NULL,
  direction   VARCHAR(12) NOT NULL DEFAULT 'payable' CHECK (direction IN ('payable', 'receivable')),
  vendor_id   UUID REFERENCES vendors(id) ON DELETE SET NULL,
  party_name  VARCHAR(160),
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  issue_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date    DATE,
  status      VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  notes       TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, direction, number)
);

CREATE TABLE IF NOT EXISTS tickets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  subject        VARCHAR(200) NOT NULL,
  description    TEXT,
  category       VARCHAR(60),
  priority       VARCHAR(12) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status         VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  requester_id   UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  assignee_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sla_due_at     TIMESTAMPTZ,
  sla_breached_at TIMESTAMPTZ,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  name       VARCHAR(160) NOT NULL,
  phone      VARCHAR(30),
  email      VARCHAR(160),
  company    VARCHAR(160),
  source     VARCHAR(60),
  status     VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  est_value  NUMERIC(14, 2),
  notes      TEXT,
  owner_id   UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  title          VARCHAR(200) NOT NULL,
  lead_id        UUID REFERENCES leads(id) ON DELETE SET NULL,
  value          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status         VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'proposal', 'negotiation', 'won', 'lost')),
  expected_close DATE,
  notes          TEXT,
  owner_id       UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS territories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  name       VARCHAR(120) NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS visits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  party_name       VARCHAR(160) NOT NULL,
  purpose          TEXT,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  territory_id     UUID REFERENCES territories(id) ON DELETE SET NULL,
  planned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'checked_in', 'completed', 'cancelled')),
  check_in_at      TIMESTAMPTZ,
  check_out_at     TIMESTAMPTZ,
  -- Coordinates are stored only when the employee agreed to share location for this check-in.
  location_consent BOOLEAN NOT NULL DEFAULT false,
  check_in_lat     NUMERIC(9, 6),
  check_in_lng     NUMERIC(9, 6),
  outcome          TEXT,
  owner_id         UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT visits_location_needs_consent CHECK (location_consent OR (check_in_lat IS NULL AND check_in_lng IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_vendors_org     ON vendors(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org    ON invoices(org_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_org     ON tickets(org_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_leads_org       ON leads(org_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_owner     ON leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_org       ON deals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_visits_owner    ON visits(owner_id, planned_at);

-- Any person a row names (owner, assignee...) must be in the row's org.
-- Usage: EXECUTE FUNCTION people_in_org('owner_id', 'assignee_id').
CREATE OR REPLACE FUNCTION public.people_in_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_json JSONB := to_jsonb(NEW);
  col TEXT;
  person UUID;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    person := NULLIF(row_json ->> col, '')::uuid;
    IF person IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = person AND org_id = NEW.org_id) THEN
      RAISE EXCEPTION '% must be someone in this organisation.', col;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- Standard permission-engine policies for a table with one owner column.
DO $$
DECLARE
  spec TEXT[];
  t TEXT; m TEXT; o TEXT;
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ['vendors',  'vendors',  'created_by'],
    ['invoices', 'invoices', 'created_by'],
    ['leads',    'leads',    'owner_id'],
    ['deals',    'deals',    'owner_id'],
    ['visits',   'visits',   'owner_id']
  ] LOOP
    t := spec[1]; m := spec[2]; o := spec[3];
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND public.can_reach(%L, ''view'', %I))', t || '_read', t, m, o);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_create', t);
    -- Create for yourself; creating for someone else needs the assign action over them.
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (org_id = public.current_org_id() AND public.has_perm(%L, ''create'') AND (%I = auth.uid() OR public.can_reach(%L, ''assign'', %I)))', t || '_create', t, m, o, m, o);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_edit', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (org_id = public.current_org_id() AND public.can_reach(%L, ''edit'', %I)) WITH CHECK (org_id = public.current_org_id() AND (public.can_reach(%L, ''edit'', %I) OR public.can_reach(%L, ''assign'', %I)))', t || '_edit', t, m, o, m, o, m, o);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (org_id = public.current_org_id() AND public.can_reach(%L, ''delete'', %I))', t || '_delete', t, m, o);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_people', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.people_in_org(%L)', 'trg_' || t || '_people', t, o);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_emit_event', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.emit_workflow_event(%L, %L)', 'trg_' || t || '_emit_event', t, rtrim(t, 's'), o);
  END LOOP;
END $$;

-- Tickets: the requester and the assignee always see their ticket; the
-- assignee can work it; wider reach comes from the tickets grants.
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tickets_read ON tickets;
CREATE POLICY tickets_read ON tickets FOR SELECT TO authenticated USING (
  org_id = public.current_org_id()
  AND (requester_id = auth.uid() OR assignee_id = auth.uid() OR public.can_reach('tickets', 'view', requester_id)));
DROP POLICY IF EXISTS tickets_create ON tickets;
CREATE POLICY tickets_create ON tickets FOR INSERT TO authenticated WITH CHECK (
  org_id = public.current_org_id() AND requester_id = auth.uid() AND public.has_perm('tickets', 'create')
  AND (assignee_id IS NULL OR public.has_perm('tickets', 'assign')));
DROP POLICY IF EXISTS tickets_edit ON tickets;
CREATE POLICY tickets_edit ON tickets FOR UPDATE TO authenticated USING (
  org_id = public.current_org_id() AND (assignee_id = auth.uid() OR public.can_reach('tickets', 'edit', requester_id)))
  WITH CHECK (org_id = public.current_org_id());
DROP POLICY IF EXISTS tickets_delete ON tickets;
CREATE POLICY tickets_delete ON tickets FOR DELETE TO authenticated USING (
  org_id = public.current_org_id() AND public.has_perm('tickets', 'manage'));

-- SLA clock: urgent 4h, high 8h, normal 24h, low 72h from creation.
-- Only someone with tickets.assign may hand a ticket to another person.
CREATE OR REPLACE FUNCTION public.tickets_before_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.priority IS DISTINCT FROM OLD.priority THEN
    NEW.sla_due_at := NEW.created_at + CASE NEW.priority
      WHEN 'urgent' THEN INTERVAL '4 hours' WHEN 'high' THEN INTERVAL '8 hours'
      WHEN 'low' THEN INTERVAL '72 hours' ELSE INTERVAL '24 hours' END;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       AND NOT public.has_perm('tickets', 'assign') THEN
      RAISE EXCEPTION 'You are not allowed to reassign tickets.';
    END IF;
    IF NEW.status IN ('resolved', 'closed') AND OLD.status NOT IN ('resolved', 'closed') THEN
      NEW.resolved_at := now();
    ELSIF NEW.status NOT IN ('resolved', 'closed') THEN
      NEW.resolved_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tickets_before_write ON tickets;
CREATE TRIGGER trg_tickets_before_write BEFORE INSERT OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION public.tickets_before_write();
DROP TRIGGER IF EXISTS trg_tickets_people ON tickets;
CREATE TRIGGER trg_tickets_people BEFORE INSERT OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION public.people_in_org('requester_id', 'assignee_id');
DROP TRIGGER IF EXISTS trg_tickets_emit_event ON tickets;
CREATE TRIGGER trg_tickets_emit_event AFTER INSERT OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION public.emit_workflow_event('ticket', 'requester_id');

-- Territories: everyone in the org reads them; team managers maintain them.
ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS territories_read ON territories;
CREATE POLICY territories_read ON territories FOR SELECT TO authenticated USING (org_id = public.current_org_id());
DROP POLICY IF EXISTS territories_manage ON territories;
CREATE POLICY territories_manage ON territories FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('team', 'manage'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_perm('team', 'manage'));

-- Scheduler job (service role): flag tickets past their SLA once, tell the
-- assignee's manager (or the requester's, if unassigned), mark overdue invoices.
CREATE OR REPLACE FUNCTION public.run_sla_checks()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t tickets%ROWTYPE;
  boss UUID;
  n INT := 0;
BEGIN
  FOR t IN SELECT * FROM tickets WHERE status NOT IN ('resolved', 'closed') AND sla_breached_at IS NULL AND sla_due_at < now() LOOP
    SELECT manager_id INTO boss FROM profiles WHERE id = COALESCE(t.assignee_id, t.requester_id);
    PERFORM public.notify_user(boss, 'Ticket past SLA', t.subject, '/service-desk');
    PERFORM public.notify_user(t.assignee_id, 'Your ticket is past SLA', t.subject, '/service-desk');
    UPDATE tickets SET sla_breached_at = now() WHERE id = t.id;
    n := n + 1;
  END LOOP;
  UPDATE invoices SET status = 'overdue' WHERE status = 'sent' AND due_date < CURRENT_DATE;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.run_sla_checks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_sla_checks() TO service_role;
