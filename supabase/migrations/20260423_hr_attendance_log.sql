-- HR Attendance Log Table
CREATE TABLE IF NOT EXISTS attendance_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  status      VARCHAR(20) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, date)
);

-- Enable RLS
ALTER TABLE attendance_log ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated for internal CRM use
CREATE POLICY "auth_all_attendance_log" ON attendance_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Enable Realtime for all HR tables
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_log;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE grievances;
ALTER PUBLICATION supabase_realtime ADD TABLE performance_reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE hr_policies;
ALTER PUBLICATION supabase_realtime ADD TABLE salary_revisions;
ALTER PUBLICATION supabase_realtime ADD TABLE training_assignments;
