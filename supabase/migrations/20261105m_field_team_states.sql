-- Phase 5: field team state/territory tagging. Mirrors the existing
-- assigned_segments/assigned_task_types specialization pattern exactly —
-- same nullable-array, "none selected = sees all" semantics, same Team
-- page section. Wiring this into assignTaskOwner()'s auto-routing (25+
-- call sites across webhooks/crons) is deliberately NOT done here: none of
-- today's task_types are field-visit tasks, so there's nothing concrete to
-- route by state yet. This just gives admins a place to tag a field rep's
-- territory now; routing logic can read it once a real field task exists.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_states TEXT[];
