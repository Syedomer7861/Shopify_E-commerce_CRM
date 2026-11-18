-- Payroll by attendance: keep what was actually paid.
--
-- Pay is computed live from attendance (paid days / days in month). When a
-- payslip is marked paid, the figures are frozen here so later attendance
-- edits never change a slip that was already paid. adjust_days is HR's
-- manual +/- correction to paid days for that month.
--
-- Additive only. Rollback:
--   ALTER TABLE public.payroll_runs DROP COLUMN IF EXISTS paid_days, DROP COLUMN IF EXISTS lop_days,
--     DROP COLUMN IF EXISTS gross_pay, DROP COLUMN IF EXISTS net_pay, DROP COLUMN IF EXISTS adjust_days,
--     DROP COLUMN IF EXISTS breakdown;

BEGIN;

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS paid_days   numeric(4,1) CHECK (paid_days IS NULL OR paid_days BETWEEN 0 AND 31),
  ADD COLUMN IF NOT EXISTS lop_days    numeric(4,1) CHECK (lop_days IS NULL OR lop_days BETWEEN 0 AND 31),
  ADD COLUMN IF NOT EXISTS gross_pay   numeric(12,2) CHECK (gross_pay IS NULL OR gross_pay >= 0),
  ADD COLUMN IF NOT EXISTS net_pay     numeric(12,2),
  ADD COLUMN IF NOT EXISTS adjust_days numeric(4,1) NOT NULL DEFAULT 0 CHECK (adjust_days BETWEEN -31 AND 31),
  ADD COLUMN IF NOT EXISTS breakdown   jsonb CHECK (breakdown IS NULL OR (jsonb_typeof(breakdown) = 'object' AND pg_column_size(breakdown) < 4000));

COMMIT;
