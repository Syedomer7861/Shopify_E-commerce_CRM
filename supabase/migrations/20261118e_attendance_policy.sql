-- Attendance rules per organisation, editable by organisation admins only.
--
-- 1. org_attendance_policy: one row per org (weekly offs, Saturday rule,
--    full/half-day hours, missed out-punch rule, very-late rule, late penalty).
--    No row = the app's built-in defaults (same behaviour as before).
-- 2. org_shift_timings: writes narrowed from admin-or-HR to admin only, so
--    shift start/grace follow the same rule. Everyone in the org still reads.
--
-- Additive except the policy change in 2. Rollback:
--   DROP TABLE IF EXISTS public.org_attendance_policy;
--   DROP POLICY IF EXISTS admin_write ON public.org_shift_timings;
--   CREATE POLICY hr_manage ON public.org_shift_timings FOR ALL TO authenticated
--     USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_role('hr')))
--     WITH CHECK (org_id = public.current_org_id() AND (public.is_admin() OR public.has_role('hr')));

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_attendance_policy (
  org_id             uuid PRIMARY KEY DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  weekly_off         smallint[] NOT NULL DEFAULT '{0}'
                     CHECK (weekly_off <@ ARRAY[0,1,2,3,4,5,6]::smallint[] AND cardinality(weekly_off) <= 6),
  saturday_rule      text NOT NULL DEFAULT 'full' CHECK (saturday_rule IN ('full','half','alt_2_4_off','alt_1_3_off')),
  full_day_minutes   int NOT NULL DEFAULT 360 CHECK (full_day_minutes BETWEEN 60 AND 960),
  half_day_minutes   int NOT NULL DEFAULT 0   CHECK (half_day_minutes BETWEEN 0 AND 600),
  missed_punch       text NOT NULL DEFAULT 'by_in_time' CHECK (missed_punch IN ('by_in_time','half_day','absent')),
  very_late_minutes  int NOT NULL DEFAULT 0   CHECK (very_late_minutes BETWEEN 0 AND 480),
  lates_per_half_day int NOT NULL DEFAULT 0   CHECK (lates_per_half_day BETWEEN 0 AND 31),
  updated_by         uuid DEFAULT auth.uid(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (half_day_minutes < full_day_minutes)
);

ALTER TABLE public.org_attendance_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_attendance_policy FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.org_attendance_policy TO authenticated;
GRANT ALL ON public.org_attendance_policy TO service_role;

DROP POLICY IF EXISTS org_read ON public.org_attendance_policy;
CREATE POLICY org_read ON public.org_attendance_policy FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
DROP POLICY IF EXISTS admin_write ON public.org_attendance_policy;
CREATE POLICY admin_write ON public.org_attendance_policy FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_admin())
  WITH CHECK (org_id = public.current_org_id() AND public.is_admin());

-- Shift timings: admin-only writes (reads stay open to the org via org_read).
DROP POLICY IF EXISTS hr_manage ON public.org_shift_timings;
DROP POLICY IF EXISTS admin_write ON public.org_shift_timings;
CREATE POLICY admin_write ON public.org_shift_timings FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_admin())
  WITH CHECK (org_id = public.current_org_id() AND public.is_admin());

COMMIT;
