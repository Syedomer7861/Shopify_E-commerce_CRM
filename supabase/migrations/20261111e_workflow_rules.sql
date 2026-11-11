-- Phase 5 of the platform plan: workflow rules.
--
-- `workflows` already drives customer messaging (order placed -> WhatsApp
-- steps). Rather than a second automation system, the same table now also
-- holds business rules: kind = 'rule', "when <event> and <conditions> then
-- <actions>". Messaging rows keep kind = 'messaging' and the messaging
-- engine never sees rule events (it matches on its own trigger names).
--
-- Flow: a row change emits a workflow_event -> process_workflow_events()
-- (run by the scheduler) matches rules, runs actions, logs a workflow_run.
-- Failures retry with backoff, then park as 'failed'. Plain SQL, no AI.
--
-- Additive. Requires 20261111b, c and d.

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS kind        VARCHAR(20) NOT NULL DEFAULT 'messaging';
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS version     INT NOT NULL DEFAULT 1;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS conditions  JSONB DEFAULT '[]'::jsonb;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS actions     JSONB DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_workflows_rules ON workflows(org_id, trigger_event) WHERE kind = 'rule';

CREATE TABLE IF NOT EXISTS workflow_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event           VARCHAR(60) NOT NULL,       -- e.g. 'expense.created', 'ticket.status_changed'
  entity_type     VARCHAR(40) NOT NULL,
  entity_id       UUID,
  owner_id        UUID,                        -- whose record it is; "owner"/"manager" in actions resolve from this
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workflow_events_due ON workflow_events(next_attempt_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS workflow_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  event_id    UUID REFERENCES workflow_events(id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL CHECK (status IN ('success', 'skipped', 'failed')),
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_wf ON workflow_runs(workflow_id, created_at DESC);

-- Read-only to people who can see workflows; only the engine writes.
ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_events_read ON workflow_events;
CREATE POLICY workflow_events_read ON workflow_events FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('workflows', 'view'));
DROP POLICY IF EXISTS workflow_runs_read ON workflow_runs;
CREATE POLICY workflow_runs_read ON workflow_runs FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('workflows', 'view'));

-- Attach to any table: CREATE TRIGGER ... EXECUTE FUNCTION emit_workflow_event('<entity>', '<owner column>').
-- Emits <entity>.created on insert and <entity>.status_changed when status
-- moves. Queues nothing unless the org has an active rule for that event,
-- and can never fail the write that fired it.
CREATE OR REPLACE FUNCTION public.emit_workflow_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_json JSONB := to_jsonb(NEW);
  ev TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    ev := TG_ARGV[0] || '.created';
  ELSIF row_json ->> 'status' IS DISTINCT FROM to_jsonb(OLD) ->> 'status' THEN
    ev := TG_ARGV[0] || '.status_changed';
  ELSE
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM workflows w WHERE w.org_id = (row_json ->> 'org_id')::uuid AND w.kind = 'rule' AND w.is_active AND w.trigger_event = ev) THEN
    INSERT INTO workflow_events (org_id, event, entity_type, entity_id, owner_id, payload)
    VALUES ((row_json ->> 'org_id')::uuid, ev, TG_ARGV[0], (row_json ->> 'id')::uuid, NULLIF(row_json ->> TG_ARGV[1], '')::uuid, row_json);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_workflow_event failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_emit_event ON expenses;
CREATE TRIGGER trg_expenses_emit_event AFTER INSERT OR UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.emit_workflow_event('expense', 'agent_id');
DROP TRIGGER IF EXISTS trg_approvals_emit_event ON approvals;
CREATE TRIGGER trg_approvals_emit_event AFTER INSERT OR UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION public.emit_workflow_event('approval', 'requested_by');

-- conditions: [{"field": "amount", "op": "gt", "value": 5000}, ...] - all must hold.
CREATE OR REPLACE FUNCTION public.rule_matches(conditions JSONB, payload JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  c JSONB;
  actual TEXT;
  wanted TEXT;
  ok BOOLEAN;
BEGIN
  IF conditions IS NULL OR jsonb_typeof(conditions) <> 'array' THEN RETURN true; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(conditions) LOOP
    actual := payload ->> (c ->> 'field');
    wanted := c ->> 'value';
    ok := CASE c ->> 'op'
      WHEN 'eq'       THEN actual IS NOT DISTINCT FROM wanted
      WHEN 'neq'      THEN actual IS DISTINCT FROM wanted
      WHEN 'contains' THEN actual ILIKE '%' || wanted || '%'
      WHEN 'gt'       THEN actual::numeric >  wanted::numeric
      WHEN 'gte'      THEN actual::numeric >= wanted::numeric
      WHEN 'lt'       THEN actual::numeric <  wanted::numeric
      WHEN 'lte'      THEN actual::numeric <= wanted::numeric
      ELSE false END;
    IF ok IS NOT TRUE THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;   -- e.g. a numeric comparison on a non-number: the rule does not match
END;
$$;

-- "owner" | "manager" | "role:<name>" | "user:<uuid>" -> people, always inside the org.
CREATE OR REPLACE FUNCTION public.rule_targets(spec TEXT, org UUID, owner UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM profiles p
  WHERE p.org_id = org AND p.is_active AND (
       (spec = 'owner'   AND p.id = owner)
    OR (spec = 'manager' AND p.id = (SELECT manager_id FROM profiles WHERE id = owner))
    OR (spec LIKE 'role:%' AND p.role = substr(spec, 6))
    OR (spec LIKE 'user:%' AND p.id::text = substr(spec, 6)));
$$;

-- "Expense of {{amount}} filed" -> values from the event payload.
CREATE OR REPLACE FUNCTION public.rule_text(template TEXT, payload JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k TEXT;
  out_text TEXT := COALESCE(template, '');
BEGIN
  FOR k IN SELECT jsonb_object_keys(payload) LOOP
    out_text := replace(out_text, '{{' || k || '}}', COALESCE(payload ->> k, ''));
  END LOOP;
  RETURN out_text;
END;
$$;

-- actions: [{"type": "notify", "to": "manager", "title": "...", "body": "...", "link": "/..."},
--           {"type": "create_approval", "title": "...", "approver": "manager" | "user:<uuid>"}]
CREATE OR REPLACE FUNCTION public.process_workflow_events(batch INT DEFAULT 50)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev workflow_events%ROWTYPE;
  wf workflows%ROWTYPE;
  act JSONB;
  target UUID;
  handled INT := 0;
BEGIN
  FOR ev IN SELECT * FROM workflow_events WHERE status = 'pending' AND next_attempt_at <= now()
            ORDER BY created_at LIMIT batch FOR UPDATE SKIP LOCKED LOOP
    BEGIN
      FOR wf IN SELECT * FROM workflows WHERE org_id = ev.org_id AND kind = 'rule' AND is_active AND trigger_event = ev.event LOOP
        IF NOT public.rule_matches(wf.conditions, ev.payload) THEN
          INSERT INTO workflow_runs (org_id, workflow_id, event_id, status, detail) VALUES (ev.org_id, wf.id, ev.id, 'skipped', 'conditions not met');
          CONTINUE;
        END IF;
        FOR act IN SELECT * FROM jsonb_array_elements(COALESCE(wf.actions, '[]'::jsonb)) LOOP
          IF act ->> 'type' = 'notify' THEN
            FOR target IN SELECT public.rule_targets(act ->> 'to', ev.org_id, ev.owner_id) LOOP
              PERFORM public.notify_user(target, public.rule_text(act ->> 'title', ev.payload), public.rule_text(act ->> 'body', ev.payload), act ->> 'link');
            END LOOP;
          ELSIF act ->> 'type' = 'create_approval' THEN
            IF ev.owner_id IS NULL THEN RAISE EXCEPTION 'create_approval needs a record owner'; END IF;
            INSERT INTO approvals (entity_type, title, detail, requested_by, approver_id, org_id)
            VALUES ('request', public.rule_text(act ->> 'title', ev.payload), 'Raised by rule: ' || wf.name, ev.owner_id,
                    (SELECT public.rule_targets(COALESCE(act ->> 'approver', 'manager'), ev.org_id, ev.owner_id) LIMIT 1), ev.org_id);
          ELSE
            RAISE EXCEPTION 'unknown action type: %', act ->> 'type';
          END IF;
        END LOOP;
        INSERT INTO workflow_runs (org_id, workflow_id, event_id, status) VALUES (ev.org_id, wf.id, ev.id, 'success');
      END LOOP;
      UPDATE workflow_events SET status = 'done', processed_at = now() WHERE id = ev.id;
    EXCEPTION WHEN OTHERS THEN
      -- Everything this event did is rolled back; retry in 2, 4, 8, 16 min, then give up.
      UPDATE workflow_events SET attempts = attempts + 1, last_error = SQLERRM,
             status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
             next_attempt_at = now() + make_interval(mins => (2 ^ (attempts + 1))::int)
      WHERE id = ev.id;
      INSERT INTO workflow_runs (org_id, workflow_id, event_id, status, detail) VALUES (ev.org_id, wf.id, ev.id, 'failed', SQLERRM);
    END;
    handled := handled + 1;
  END LOOP;
  RETURN handled;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_workflow_events(INT), public.rule_targets(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_workflow_events(INT) TO service_role;

-- The existing workflows policy lets any member of the org write any row.
-- That stays as it is for messaging workflows, but a rule can notify people
-- and raise approvals, so rule rows additionally need the workflows grants.
-- RESTRICTIVE = narrows the existing policy for kind = 'rule' only.
DROP POLICY IF EXISTS workflows_rules_read ON workflows;
CREATE POLICY workflows_rules_read ON workflows AS RESTRICTIVE FOR SELECT TO authenticated
  USING (kind <> 'rule' OR public.has_perm('workflows', 'view'));
DROP POLICY IF EXISTS workflows_rules_insert ON workflows;
CREATE POLICY workflows_rules_insert ON workflows AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (kind <> 'rule' OR public.has_perm('workflows', 'manage'));
DROP POLICY IF EXISTS workflows_rules_update ON workflows;
CREATE POLICY workflows_rules_update ON workflows AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (kind <> 'rule' OR public.has_perm('workflows', 'manage'))
  WITH CHECK (kind <> 'rule' OR public.has_perm('workflows', 'manage'));
DROP POLICY IF EXISTS workflows_rules_delete ON workflows;
CREATE POLICY workflows_rules_delete ON workflows AS RESTRICTIVE FOR DELETE TO authenticated
  USING (kind <> 'rule' OR public.has_perm('workflows', 'manage'));
