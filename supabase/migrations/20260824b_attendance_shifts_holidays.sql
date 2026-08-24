-- ============================================================
-- Attendance module rebuild: real shift assignment, real holiday
-- persistence, and the fields the auto-computed daily register needs.
--
-- Context: AttendanceRegister.tsx's Shift Assignment and Holiday Calendar
-- tabs have never persisted anything - shifts reset to "Morning" for every
-- agent on refresh, and the holiday list is a hardcoded array of 2025 dates
-- baked into the component. Neither survives a page reload.
--
-- Safe to re-run.
-- ============================================================

-- 1. Shift assignment, persisted per agent. Matches the four options the UI
--    already offers (Morning/Afternoon/Night/Off); no schema for rotating
--    or dated shifts, since the existing UI doesn't model that either.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shift_type VARCHAR(20) NOT NULL DEFAULT 'Morning'
  CHECK (shift_type IN ('Morning', 'Afternoon', 'Night', 'Off'));

-- 2. Holiday calendar. Previously local-only React state - "Add Holiday"
--    appeared to save but vanished on refresh.
CREATE TABLE IF NOT EXISTS holidays (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE NOT NULL UNIQUE,
  name       VARCHAR(255) NOT NULL,
  type       VARCHAR(20) NOT NULL DEFAULT 'National' CHECK (type IN ('National', 'Optional')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_holidays" ON holidays;
CREATE POLICY "auth_all_holidays" ON holidays
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE holidays;

-- Fixed-date national holidays only (law-mandated same date every year).
-- Deliberately not seeding movable-date holidays (Diwali, Eid, Holi, etc.)
-- since guessing next year's date would be worse than leaving it for HR to
-- add for real once confirmed.
INSERT INTO holidays (date, name, type) VALUES
  ('2026-01-26', 'Republic Day', 'National'),
  ('2026-08-15', 'Independence Day', 'National'),
  ('2026-10-02', 'Gandhi Jayanti', 'National'),
  ('2026-12-25', 'Christmas', 'Optional')
ON CONFLICT (date) DO NOTHING;

-- 3. attendance_log gains the fields the corrected auto-computation needs
--    to show actual clock-in/out and break time, not just a P/A/HD/L
--    letter. Nullable: manual HR entries (an agent phones in sick) won't
--    have clock times, and that's fine - is_auto tells the UI which is
--    which.
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS clock_in TIMESTAMPTZ;
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS clock_out TIMESTAMPTZ;
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS productive_minutes INTEGER;
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS break_minutes INTEGER;
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS is_auto BOOLEAN NOT NULL DEFAULT false;
