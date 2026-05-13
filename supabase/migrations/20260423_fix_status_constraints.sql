-- 1. Drop the old constraints
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE agent_attendance DROP CONSTRAINT IF EXISTS agent_attendance_status_check;

-- 2. Add the new constraints
ALTER TABLE profiles ADD CONSTRAINT profiles_status_check 
CHECK (status IN ('online', 'break', 'offline', 'meeting', 'lunch', 'away'));

ALTER TABLE agent_attendance ADD CONSTRAINT agent_attendance_status_check
CHECK (status IN ('online', 'break', 'offline', 'meeting', 'lunch', 'away'));
