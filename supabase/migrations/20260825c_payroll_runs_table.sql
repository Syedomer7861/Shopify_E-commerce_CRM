-- ============================================================
-- Payroll Run's "Mark All Paid" / per-row "Toggle" buttons were pure
-- local React state (src/components/hr/PayrollRun.tsx) - no database
-- write at all. Refreshing the page reset every payslip back to
-- "Pending", with no record of who actually marked what paid or when.
--
-- Salary breakdown (basic/HRA/PF/PT/TDS/net) stays computed client-side
-- from profiles.monthly_salary, same as before - it's derived, not
-- stored state, and recomputing it live means an edited salary always
-- shows correctly for the current month. Only the disbursement STATUS
-- needed real persistence, so that's all this table holds.
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_runs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month      VARCHAR(7) NOT NULL, -- 'YYYY-MM'
  status     VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  marked_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  marked_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, month)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_month ON payroll_runs (month);

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON payroll_runs;
CREATE POLICY "auth_all" ON payroll_runs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
