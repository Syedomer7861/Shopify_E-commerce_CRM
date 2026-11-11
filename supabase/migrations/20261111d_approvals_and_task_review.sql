-- Phase 4 of the platform plan: central tasks + approvals.
--
-- The Workspace engine (mkt_*) stays the one task system. This adds what it
-- lacked: a review gate, and a single approvals inbox shared by tasks,
-- expenses and (from Phase 5) workflow rules - instead of each module
-- growing its own approve/reject columns and screens.
--
-- Additive. Requires 20261111b and 20261111c.

ALTER TABLE mkt_tasks ADD COLUMN IF NOT EXISTS reviewer_id     UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE mkt_tasks ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20);
ALTER TABLE mkt_tasks ADD COLUMN IF NOT EXISTS department_id   UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE mkt_tasks ADD COLUMN IF NOT EXISTS escalated_at    TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  entity_type   VARCHAR(40) NOT NULL,          -- 'task' | 'expense' | 'request'
  entity_id     UUID,
  title         TEXT NOT NULL,
  detail        TEXT,
  amount        NUMERIC,
  requested_by  UUID REFERENCES profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  approver_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decision_note TEXT,
  decided_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  escalated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One open approval per record.
CREATE UNIQUE INDEX IF NOT EXISTS uq_approvals_open ON approvals(entity_type, entity_id) WHERE status = 'pending' AND entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approvals_approver ON approvals(approver_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approvals_requester ON approvals(requested_by);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id);

-- In-app notification that can never fail the business write that caused it.
CREATE OR REPLACE FUNCTION public.notify_user(target UUID, n_title TEXT, n_body TEXT, n_link TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF target IS NULL THEN RETURN; END IF;
  INSERT INTO notifications (org_id, user_id, title, body, link, type)
  SELECT p.org_id, p.id, n_title, n_body, n_link, 'info' FROM profiles p WHERE p.id = target;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_user failed: %', SQLERRM;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Fills in what the client must not be trusted with: whose request it is,
-- which org, and who approves (task reviewer, else the requester's manager).
CREATE OR REPLACE FUNCTION public.approvals_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t mkt_tasks%ROWTYPE;
  e expenses%ROWTYPE;
BEGIN
  NEW.status := 'pending';
  NEW.decided_by := NULL; NEW.decided_at := NULL; NEW.decision_note := NULL;

  IF NEW.entity_type = 'task' THEN
    SELECT * INTO t FROM mkt_tasks WHERE id = NEW.entity_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Task not found.'; END IF;
    NEW.requested_by := COALESCE(auth.uid(), NEW.requested_by, t.created_by);
    IF NOT (NEW.requested_by = ANY (t.assignees) OR NEW.requested_by = t.created_by) THEN
      RAISE EXCEPTION 'Only someone working on the task can send it for review.';
    END IF;
    NEW.org_id := t.org_id;
    NEW.approver_id := COALESCE(t.reviewer_id, NEW.approver_id);
  ELSIF NEW.entity_type = 'expense' THEN
    SELECT * INTO e FROM expenses WHERE id = NEW.entity_id;
    IF NOT FOUND OR lower(e.status) <> 'pending' THEN RAISE EXCEPTION 'Expense not found or already decided.'; END IF;
    NEW.requested_by := e.agent_id;
    NEW.org_id := e.org_id;
    NEW.amount := e.amount;
  ELSE
    NEW.requested_by := COALESCE(auth.uid(), NEW.requested_by);
  END IF;

  IF NEW.requested_by IS NULL THEN RAISE EXCEPTION 'An approval needs a requester.'; END IF;
  IF NEW.entity_type NOT IN ('task', 'expense') THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE id = NEW.requested_by;
  END IF;
  IF NEW.approver_id IS NULL OR NEW.approver_id = NEW.requested_by THEN
    SELECT manager_id INTO NEW.approver_id FROM profiles WHERE id = NEW.requested_by;
  END IF;
  IF NEW.approver_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.approver_id AND org_id = NEW.org_id AND is_active) THEN
    NEW.approver_id := NULL;  -- left for anyone holding approvals.approve
  END IF;
  RETURN NEW;
END;
$$;

-- A decision is final, is never the requester's own (admins excepted), and
-- nobody but an admin rewrites what was asked for.
CREATE OR REPLACE FUNCTION public.approvals_before_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF (NEW.entity_type, NEW.entity_id, NEW.title, NEW.amount, NEW.requested_by, NEW.org_id)
       IS DISTINCT FROM (OLD.entity_type, OLD.entity_id, OLD.title, OLD.amount, OLD.requested_by, OLD.org_id) THEN
      RAISE EXCEPTION 'An approval request cannot be rewritten.';
    END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'This request was already %.', OLD.status; END IF;
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      IF NEW.status = 'cancelled' AND auth.uid() <> OLD.requested_by THEN
        RAISE EXCEPTION 'Only the requester can cancel.';
      END IF;
      IF NEW.status IN ('approved', 'rejected') AND auth.uid() = OLD.requested_by THEN
        RAISE EXCEPTION 'You cannot decide your own request.';
      END IF;
    END IF;
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Carries the outcome back to the record and tells the people involved.
CREATE OR REPLACE FUNCTION public.approvals_after_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.entity_type = 'task' THEN
      UPDATE mkt_tasks SET approval_status = 'pending' WHERE id = NEW.entity_id;
    END IF;
    PERFORM public.notify_user(NEW.approver_id, 'Approval needed', NEW.title, '/approvals');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.entity_type = 'task' THEN
      UPDATE mkt_tasks SET approval_status = NULLIF(NEW.status, 'cancelled') WHERE id = NEW.entity_id;
    ELSIF NEW.entity_type = 'expense' AND NEW.status IN ('approved', 'rejected') THEN
      -- expenses.status is capitalised on this database ('Pending'/'Approved'/'Rejected', check-constrained).
      UPDATE expenses SET status = initcap(NEW.status) WHERE id = NEW.entity_id AND lower(status) = 'pending';
    END IF;
    IF NEW.status IN ('approved', 'rejected') THEN
      PERFORM public.notify_user(NEW.requested_by, 'Request ' || NEW.status, NEW.title, '/approvals');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_approvals_before_insert ON approvals;
CREATE TRIGGER trg_approvals_before_insert BEFORE INSERT ON approvals FOR EACH ROW EXECUTE FUNCTION public.approvals_before_insert();
DROP TRIGGER IF EXISTS trg_approvals_before_update ON approvals;
CREATE TRIGGER trg_approvals_before_update BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION public.approvals_before_update();
DROP TRIGGER IF EXISTS trg_approvals_after_write ON approvals;
CREATE TRIGGER trg_approvals_after_write AFTER INSERT OR UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION public.approvals_after_write();

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approvals_read ON approvals;
CREATE POLICY approvals_read ON approvals FOR SELECT TO authenticated USING (
  org_id = public.current_org_id()
  AND (requested_by = auth.uid() OR approver_id = auth.uid() OR public.can_reach('approvals', 'view', requested_by)));
DROP POLICY IF EXISTS approvals_request ON approvals;
CREATE POLICY approvals_request ON approvals FOR INSERT TO authenticated WITH CHECK (
  org_id = public.current_org_id());   -- requester/org/approver are set by approvals_before_insert
DROP POLICY IF EXISTS approvals_decide ON approvals;
CREATE POLICY approvals_decide ON approvals FOR UPDATE TO authenticated USING (
  org_id = public.current_org_id()
  AND (requested_by = auth.uid() OR approver_id = auth.uid() OR public.can_reach('approvals', 'approve', requested_by)))
  WITH CHECK (org_id = public.current_org_id());
DROP POLICY IF EXISTS approvals_admin_delete ON approvals;
CREATE POLICY approvals_admin_delete ON approvals FOR DELETE TO authenticated USING (public.is_admin() AND org_id = public.current_org_id());

-- Expenses: every pending claim opens an approval; a decision made the old
-- way (HR screen writing expenses.status) closes it so the inbox stays true.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url  TEXT;
-- So a claim filed from the browser lands in the filer's org without the client naming it.
ALTER TABLE expenses ALTER COLUMN org_id SET DEFAULT public.current_org_id();

CREATE OR REPLACE FUNCTION public.expenses_sync_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF lower(NEW.status) = 'pending' AND NEW.agent_id IS NOT NULL THEN
      INSERT INTO approvals (entity_type, entity_id, title, org_id, requested_by)
      VALUES ('expense', NEW.id, 'Expense: ' || COALESCE(NEW.category, 'claim') || ' - ' || COALESCE(NEW.amount, 0), NEW.org_id, NEW.agent_id)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND lower(OLD.status) = 'pending' THEN
    UPDATE approvals SET status = CASE WHEN lower(NEW.status) IN ('approved', 'rejected') THEN lower(NEW.status) ELSE 'cancelled' END
    WHERE entity_type = 'expense' AND entity_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_expenses_sync_approval ON expenses;
CREATE TRIGGER trg_expenses_sync_approval AFTER INSERT OR UPDATE OF status ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_sync_approval();

-- Permission-engine access to expenses, alongside whatever policies exist.
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expenses_perm_read ON expenses;
CREATE POLICY expenses_perm_read ON expenses FOR SELECT TO authenticated USING (
  org_id = public.current_org_id() AND public.can_reach('expenses', 'view', agent_id));
DROP POLICY IF EXISTS expenses_perm_create ON expenses;
CREATE POLICY expenses_perm_create ON expenses FOR INSERT TO authenticated WITH CHECK (
  org_id = public.current_org_id() AND agent_id = auth.uid() AND lower(status) = 'pending' AND public.has_perm('expenses', 'create'));

-- Claims that were already waiting before this migration get an approval too.
INSERT INTO approvals (entity_type, entity_id, title, org_id, requested_by)
SELECT 'expense', e.id, 'Expense: ' || COALESCE(e.category, 'claim') || ' - ' || COALESCE(e.amount, 0), e.org_id, e.agent_id
FROM expenses e WHERE lower(e.status) = 'pending' AND e.agent_id IS NOT NULL AND e.org_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Run from the scheduler (service role). Nudges up the reporting line:
-- approvals nobody touched for 2 days, tasks 2+ days overdue.
CREATE OR REPLACE FUNCTION public.run_work_escalations()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n INT := 0;
  a RECORD;
  t RECORD;
  boss UUID;
  who UUID;
BEGIN
  FOR a IN SELECT * FROM approvals WHERE status = 'pending' AND escalated_at IS NULL AND created_at < now() - INTERVAL '2 days' LOOP
    SELECT manager_id INTO boss FROM profiles WHERE id = COALESCE(a.approver_id, a.requested_by);
    PERFORM public.notify_user(boss, 'Approval waiting 2+ days', a.title, '/approvals');
    UPDATE approvals SET escalated_at = now() WHERE id = a.id;
    n := n + 1;
  END LOOP;
  FOR t IN SELECT * FROM mkt_tasks WHERE completed_at IS NULL AND escalated_at IS NULL AND due_date < CURRENT_DATE - 1 LOOP
    FOREACH who IN ARRAY COALESCE(t.assignees, '{}') LOOP
      SELECT manager_id INTO boss FROM profiles WHERE id = who;
      PERFORM public.notify_user(boss, 'Task overdue in your team', t.title, '/workspace');
    END LOOP;
    UPDATE mkt_tasks SET escalated_at = now() WHERE id = t.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.run_work_escalations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_work_escalations() TO service_role;
