-- ============================================================
-- CureForever CRM — HR Dashboard & Role Hardening
-- ============================================================

-- 1. Expand roles to include HR
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'agent', 'hr'));

-- 2. Create leaves table for leave tracking (mentioned in HR dashboard spec)
CREATE TABLE IF NOT EXISTS leaves (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS and add basic policies
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON leaves;
CREATE POLICY "auth_all" ON leaves FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Ensure updated_at trigger exists (already in schema.sql, but safe to re-apply)
DROP TRIGGER IF EXISTS leaves_updated_at ON leaves;
CREATE TRIGGER leaves_updated_at BEFORE UPDATE ON leaves FOR EACH ROW EXECUTE FUNCTION update_updated_at();
