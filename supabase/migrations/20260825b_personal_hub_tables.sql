-- ============================================================
-- Schema drift: My Hub's three tables (personal_todos, personal_notes,
-- personal_reminders) have never had a migration. TodoSection.tsx even
-- catches 42P01 ("undefined table") explicitly and tells the user to run
-- "scratch/setup_hub.sql" - scratch/ is gitignored, so whatever script
-- created these tables in production was never committed anywhere.
--
-- Same class of gap as agent_attendance
-- (20260824_agent_attendance_table.sql): the feature already works in
-- production because someone set the tables up by hand, but a fresh
-- database - a new environment, a restore, a second developer - would hit
-- the exact 42P01 these components already anticipate.
--
-- Reconstructed from the exact columns each component reads and writes.
-- Private data, one user's own list: RLS restricts every row to its owner,
-- unlike the "any authenticated staff" pattern used for shared CRM/HR
-- tables elsewhere in this schema.
--
-- IF NOT EXISTS throughout, so this is a no-op wherever the tables already
-- exist.
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_todos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  priority     VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL DEFAULT 'Untitled Note',
  content    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_reminders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  remind_at  TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_todos_user     ON personal_todos (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_personal_notes_user     ON personal_notes (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_personal_reminders_user ON personal_reminders (user_id, remind_at);

ALTER TABLE personal_todos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_personal_todos" ON personal_todos;
CREATE POLICY "own_personal_todos" ON personal_todos
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_personal_notes" ON personal_notes;
CREATE POLICY "own_personal_notes" ON personal_notes
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_personal_reminders" ON personal_reminders;
CREATE POLICY "own_personal_reminders" ON personal_reminders
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
