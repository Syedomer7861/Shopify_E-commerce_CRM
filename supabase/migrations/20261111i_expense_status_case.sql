-- Follow-up to 20261111d for databases where it already ran: expenses.status
-- is capitalised here ('Pending'/'Approved'/'Rejected', check-constrained),
-- and the approval hooks compared against lowercase, so a new claim opened
-- no approval and an approval could not write its outcome back. Same
-- definitions as the corrected 20261111d. Safe to re-run.
BEGIN;

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

DROP POLICY IF EXISTS expenses_perm_create ON expenses;
CREATE POLICY expenses_perm_create ON expenses FOR INSERT TO authenticated WITH CHECK (
  org_id = public.current_org_id() AND agent_id = auth.uid() AND lower(status) = 'pending' AND public.has_perm('expenses', 'create'));

-- Claims that were already waiting before this migration get an approval too.
INSERT INTO approvals (entity_type, entity_id, title, org_id, requested_by)
SELECT 'expense', e.id, 'Expense: ' || COALESCE(e.category, 'claim') || ' - ' || COALESCE(e.amount, 0), e.org_id, e.agent_id
FROM expenses e WHERE lower(e.status) = 'pending' AND e.agent_id IS NOT NULL AND e.org_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
