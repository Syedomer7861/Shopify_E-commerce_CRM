-- ============================================================
-- CureForever CRM — Manager Role & Task Review Extensions
-- ============================================================

-- 1. Expand roles to include 'manager'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'agent', 'hr', 'manager'));

-- 2. Enhance tasks table for Manager Review workflow
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_processed_by_manager BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manager_processed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manager_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manager_action VARCHAR(30) CHECK (manager_action IN ('approved', 'rejected', 'shiprocket_updated'));

-- 3. Indexing for faster review queue lookups
CREATE INDEX IF NOT EXISTS idx_tasks_manager_review ON tasks (status, is_processed_by_manager) WHERE status = 'done';
