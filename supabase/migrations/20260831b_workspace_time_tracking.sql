-- ============================================================
-- Workspace Slice 5 — time tracking
--
--   mkt_tasks.estimate_minutes   optional per-task estimate
--   mkt_time_entries             logged work against a task
--
-- Feeds the "Time" section in TaskPanel and the workload view. Gated the
-- same way as mkt_comments: any member of the task's Space can read/write.
-- Re-runnable (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

ALTER TABLE mkt_tasks ADD COLUMN IF NOT EXISTS estimate_minutes INTEGER
  CHECK (estimate_minutes IS NULL OR (estimate_minutes >= 0 AND estimate_minutes <= 100000));

CREATE TABLE IF NOT EXISTS mkt_time_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES mkt_tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  minutes     INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  note        TEXT,
  spent_on    DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mkt_time_entries_task_idx ON mkt_time_entries (task_id);
CREATE INDEX IF NOT EXISTS mkt_time_entries_user_idx ON mkt_time_entries (user_id, spent_on);

ALTER TABLE mkt_time_entries ENABLE ROW LEVEL SECURITY;

-- Read/write for anyone who can see the task's Space (mirrors mkt_comments).
DROP POLICY IF EXISTS "mkt_time_entries_rw" ON mkt_time_entries;
CREATE POLICY "mkt_time_entries_rw" ON mkt_time_entries FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_time_entries.task_id
      AND (l.space_id IS NULL OR public.can_access_space(l.space_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_time_entries.task_id
      AND (l.space_id IS NULL OR public.can_access_space(l.space_id))
  ));
