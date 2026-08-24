-- ============================================================
-- Schema drift: agent_attendance has no CREATE TABLE anywhere in the
-- migrations, even though 20260427_rls_hardening.sql enables RLS and writes
-- policies against it, and six application files read and write it
-- (Sidebar.tsx clock-in/out, team/status, hr/data, dashboard/agent,
-- reports/page.tsx). It exists in production only because someone created
-- it by hand in the Table Editor.
--
-- This does not fix a live bug - production already has the table - but a
-- fresh database built from this migrations folder (a new environment, a
-- restore, a second developer) would be missing it and every one of those
-- six call sites would throw. Reconstructed from how the app queries it:
-- agent_id, status, reason (nullable), created_at.
--
-- IF NOT EXISTS, so this is a no-op on production and only matters for
-- environments that don't already have the table.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     VARCHAR(20) NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_attendance_agent_created
  ON agent_attendance (agent_id, created_at);

ALTER TABLE agent_attendance ENABLE ROW LEVEL SECURITY;

-- Same policies as 20260427_rls_hardening.sql, restated here so this
-- migration is self-sufficient if run against a database that never saw
-- that one.
DROP POLICY IF EXISTS "admin_hr_all_attendance" ON agent_attendance;
CREATE POLICY "admin_hr_all_attendance" ON agent_attendance
  FOR SELECT TO authenticated
  USING (public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'hr');

DROP POLICY IF EXISTS "agent_own_attendance" ON agent_attendance;
CREATE POLICY "agent_own_attendance" ON agent_attendance
  FOR SELECT TO authenticated
  USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "agent_create_own_attendance" ON agent_attendance;
CREATE POLICY "agent_create_own_attendance" ON agent_attendance
  FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid());
