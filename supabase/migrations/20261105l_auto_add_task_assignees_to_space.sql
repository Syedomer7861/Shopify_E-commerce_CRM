-- Phase 4 (revised): cross-department task assignment, reusing mkt_tasks +
-- Spaces instead of a new standalone work_items table — Spaces already ARE
-- departments (Cureforever Amazon, Marketing, etc), with boards, My Work,
-- Workload, goals, and time tracking all already built on top of them.
--
-- The assignee picker (workspace/page.tsx) already lists every active org
-- profile, not just current Space members, so a manager can already pick
-- anyone. The actual gap: mkt_tasks_read's RLS only grants access via
-- can_access_space(), which checks mkt_space_members — so a task assigned
-- to a non-member is invisible to the very person it was assigned to.
--
-- Fix: whenever a task's assignees change, auto-add anyone new as a member
-- of that task's Space. Matches the same "DB enforces the invariant, not
-- app-code discipline" approach already used elsewhere in this schema
-- (e.g. prevent_profile_self_escalation).

CREATE OR REPLACE FUNCTION public.auto_add_task_assignees_to_space()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_space UUID;
  assignee UUID;
BEGIN
  SELECT space_id INTO target_space FROM mkt_lists WHERE id = NEW.list_id;
  IF target_space IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH assignee IN ARRAY NEW.assignees
  LOOP
    INSERT INTO mkt_space_members (space_id, user_id, role, added_by, org_id)
    VALUES (target_space, assignee, 'member', NEW.created_by, NEW.org_id)
    ON CONFLICT (space_id, user_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_add_task_assignees_to_space ON mkt_tasks;
CREATE TRIGGER trg_auto_add_task_assignees_to_space
  AFTER INSERT OR UPDATE OF assignees ON mkt_tasks
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_task_assignees_to_space();
