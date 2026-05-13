-- ============================================================
-- CureForever CRM — Full HR Suite Persistence Layer
-- ============================================================

-- 1. Enhance Profiles for HR Metadata
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS joining_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location VARCHAR(100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_salary DECIMAL(12,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_progress JSONB DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS offboarding_progress JSONB DEFAULT '[]';

-- 2. Announcements Table
CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,
  type        VARCHAR(20) NOT NULL CHECK (type IN ('Info', 'Important', 'Celebration', 'Alert')),
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  author_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. HR Policies (Documents)
CREATE TABLE IF NOT EXISTS hr_policies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  category    VARCHAR(50) NOT NULL CHECK (category IN ('Compliance', 'Leave', 'Operations', 'General')),
  file_url    TEXT,
  file_size   VARCHAR(20),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Salary Revisions
CREATE TABLE IF NOT EXISTS salary_revisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  old_salary      DECIMAL(12,2) NOT NULL,
  new_salary      DECIMAL(12,2) NOT NULL,
  reason          TEXT,
  effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Expenses / Reimbursements
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category    VARCHAR(50) NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  description TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Performance Reviews
CREATE TABLE IF NOT EXISTS performance_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period      VARCHAR(50) NOT NULL, -- e.g. 'Q1 2025'
  rating      DECIMAL(3,2) DEFAULT 0,
  feedback    TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Scheduled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Training Assignments
CREATE TABLE IF NOT EXISTS training_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic         VARCHAR(255) NOT NULL,
  due_date      DATE,
  is_completed  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Grievances
CREATE TABLE IF NOT EXISTS grievances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject       VARCHAR(255) NOT NULL,
  description   TEXT NOT NULL,
  priority      VARCHAR(20) NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
  status        VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Review', 'Resolved')),
  resolution    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS for all
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated for now (Internal CRM)
CREATE POLICY "auth_all_announcements" ON announcements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_hr_policies" ON hr_policies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_salary_revisions" ON salary_revisions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_expenses" ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_performance_reviews" ON performance_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_training_assignments" ON training_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_grievances" ON grievances FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER hr_policies_updated_at BEFORE UPDATE ON hr_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER performance_reviews_updated_at BEFORE UPDATE ON performance_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER training_assignments_updated_at BEFORE UPDATE ON training_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER grievances_updated_at BEFORE UPDATE ON grievances FOR EACH ROW EXECUTE FUNCTION update_updated_at();
