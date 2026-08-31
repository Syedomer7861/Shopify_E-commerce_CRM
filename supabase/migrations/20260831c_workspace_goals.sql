-- ============================================================
-- Workspace Slice 5 — goals / targets
--
--   mkt_goals   a target for a Space over a date window, e.g.
--               "ship 8 tasks this sprint". Progress is computed at read
--               time from mkt_tasks.completed_at, not stored.
--
-- Read: any Space member. Write: Space owner or workspace admin.
-- Re-runnable.
-- ============================================================

CREATE TABLE IF NOT EXISTS mkt_goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id      UUID NOT NULL REFERENCES mkt_spaces(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  metric        TEXT NOT NULL DEFAULT 'tasks_done' CHECK (metric IN ('tasks_done')),
  target        INTEGER NOT NULL CHECK (target > 0 AND target <= 100000),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  owner_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mkt_goals_space_idx ON mkt_goals (space_id);

ALTER TABLE mkt_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mkt_goals_read" ON mkt_goals;
CREATE POLICY "mkt_goals_read" ON mkt_goals FOR SELECT TO authenticated
  USING (public.can_access_space(space_id));

DROP POLICY IF EXISTS "mkt_goals_write" ON mkt_goals;
CREATE POLICY "mkt_goals_write" ON mkt_goals FOR ALL TO authenticated
  USING (public.is_space_owner(space_id))
  WITH CHECK (public.is_space_owner(space_id));
