BEGIN;
-- eSSL / ZKTeco biometric attendance + configurable shift timings (2026-11-18).
--
-- 1. profiles.biometric_code: the employee's user ID on the device (eSSL "Emp Code").
--    Unique per organisation. Set by admin/HR through /api/hr/data.
-- 2. biometric_devices: devices registered by admin/HR. A device pushing over
--    eSSL ADMS ("Cloud server") is matched by serial_number, which is unique
--    across all organisations, so one device belongs to one workspace.
-- 3. biometric_punches: raw punches. Sources: device push (ADMS), the PC sync
--    agent (API key, attendance:write scope), or a file import. Duplicates are
--    ignored by the unique key, so re-sending the same log is harmless.
-- 4. org_shift_timings: start time + grace per shift type for "Late". Missing
--    rows fall back to the old fixed times (09:00 / 13:00 / 21:00, 15 min).
-- 5. API key scope 'attendance:write' for the sync agent.
--
-- Additive only. Rollback:
--   DROP TABLE IF EXISTS public.biometric_punches, public.biometric_devices, public.org_shift_timings;
--   DROP INDEX IF EXISTS public.profiles_org_biometric_code_key;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS biometric_code;
--   (scope CHECK: restore the previous list from 20261114j)


ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS biometric_code text
  CHECK (biometric_code IS NULL OR biometric_code ~ '^[A-Za-z0-9_-]{1,24}$');
CREATE UNIQUE INDEX IF NOT EXISTS profiles_org_biometric_code_key
  ON public.profiles (org_id, biometric_code) WHERE biometric_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.biometric_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  serial_number text NOT NULL UNIQUE CHECK (serial_number ~ '^[A-Za-z0-9_-]{4,40}$'),
  location      text CHECK (location IS NULL OR char_length(location) <= 120),
  tz_offset_minutes int NOT NULL DEFAULT 330 CHECK (tz_offset_minutes BETWEEN -720 AND 840),
  is_active     boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  last_punch_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biometric_devices_org_idx ON public.biometric_devices (org_id);

CREATE TABLE IF NOT EXISTS public.biometric_punches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id     uuid REFERENCES public.biometric_devices(id) ON DELETE SET NULL,
  employee_code text NOT NULL CHECK (employee_code ~ '^[A-Za-z0-9_-]{1,24}$'),
  punched_at    timestamptz NOT NULL,
  direction     text CHECK (direction IN ('in','out')),
  source        text NOT NULL CHECK (source IN ('device','agent','import')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, employee_code, punched_at)
);
CREATE INDEX IF NOT EXISTS biometric_punches_org_time_idx ON public.biometric_punches (org_id, punched_at);
CREATE INDEX IF NOT EXISTS biometric_punches_device_idx ON public.biometric_punches (device_id);

CREATE TABLE IF NOT EXISTS public.org_shift_timings (
  org_id        uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  shift_type    varchar(20) NOT NULL CHECK (shift_type IN ('Morning','Afternoon','Night')),
  start_minute  int NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  grace_minutes int NOT NULL DEFAULT 15 CHECK (grace_minutes BETWEEN 0 AND 180),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, shift_type)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['biometric_devices','biometric_punches','org_shift_timings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS hr_manage ON public.%I', t);
    EXECUTE format($p$CREATE POLICY hr_manage ON public.%I FOR ALL TO authenticated
      USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_role('hr')))
      WITH CHECK (org_id = public.current_org_id() AND (public.is_admin() OR public.has_role('hr')))$p$, t);
  END LOOP;
END $$;

-- Everyone in the org may read shift timings (the sidebar shows their own shift start).
DROP POLICY IF EXISTS org_read ON public.org_shift_timings;
CREATE POLICY org_read ON public.org_shift_timings FOR SELECT TO authenticated USING (org_id = public.current_org_id());

-- Raw punches are evidence: only admins may edit or delete them.
DROP POLICY IF EXISTS punches_admin_edit ON public.biometric_punches;
CREATE POLICY punches_admin_edit ON public.biometric_punches AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS punches_admin_delete ON public.biometric_punches;
CREATE POLICY punches_admin_delete ON public.biometric_punches AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_admin());

-- One row per employee per IST day: first/last punch and count. Runs as the
-- caller, so RLS limits it to admin/HR of their own org. Keeps the HR page
-- from pulling every raw punch to build the register.
CREATE OR REPLACE FUNCTION public.biometric_daily(p_since date)
RETURNS TABLE (agent_id uuid, day date, first_at timestamptz, last_at timestamptz, n int)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT p.id, (b.punched_at AT TIME ZONE 'Asia/Kolkata')::date,
         min(b.punched_at), max(b.punched_at), count(*)::int
    FROM public.biometric_punches b
    JOIN public.profiles p ON p.org_id = b.org_id AND p.biometric_code = b.employee_code
   WHERE b.org_id = public.current_org_id()
     AND b.punched_at >= (p_since::timestamp AT TIME ZONE 'Asia/Kolkata')
   GROUP BY 1, 2
$$;
REVOKE EXECUTE ON FUNCTION public.biometric_daily(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.biometric_daily(date) TO authenticated;

ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_scopes_check;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_scopes_check CHECK (
  scopes <@ ARRAY['leads:read','leads:write','deals:read','deals:write','tickets:read','attendance:write']::text[]
  AND cardinality(scopes) >= 1);


CREATE TEMP TABLE _r (n serial, k text, ok boolean, d text);
GRANT ALL ON _r TO authenticated; GRANT USAGE ON SEQUENCE _r_n_seq TO authenticated;
CREATE TEMP TABLE _x (k text, id uuid); GRANT ALL ON _x TO authenticated;
CREATE FUNCTION pg_temp.t(k text, ok boolean, d text DEFAULT '') RETURNS void LANGUAGE sql AS
  $f$ INSERT INTO _r (k, ok, d) VALUES (k, coalesce(ok, false), d) $f$;
CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS
  $f$ SELECT set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $f$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('__ADMIN__');
DO $t$ DECLARE d uuid; n int; BEGIN
  INSERT INTO biometric_devices (name, serial_number) VALUES ('Front door', 'TESTSN0001') RETURNING id INTO d;
  INSERT INTO _x VALUES ('dev', d);
  PERFORM pg_temp.t('admin_registers_device', d IS NOT NULL);
  INSERT INTO biometric_punches (device_id, employee_code, punched_at, source) VALUES (d, '101', '2026-11-18 03:35:00+00', 'import');
  INSERT INTO biometric_punches (device_id, employee_code, punched_at, source) VALUES (d, '101', '2026-11-18 03:35:00+00', 'import') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('duplicate_punch_ignored', n = 0, n::text);
  INSERT INTO org_shift_timings (shift_type, start_minute, grace_minutes) VALUES ('Morning', 600, 10);
  PERFORM pg_temp.t('admin_sets_shift_timing', true);
  BEGIN INSERT INTO biometric_punches (employee_code, punched_at, source) VALUES ('bad code!', now(), 'import');
    PERFORM pg_temp.t('bad_code_rejected', false); EXCEPTION WHEN check_violation THEN PERFORM pg_temp.t('bad_code_rejected', true); END;
END $t$;
SELECT pg_temp.as_user('__AGENT__');
DO $t$ DECLARE n int; BEGIN
  PERFORM pg_temp.t('agent_cannot_see_devices', NOT EXISTS (SELECT 1 FROM biometric_devices));
  PERFORM pg_temp.t('agent_cannot_see_punches', NOT EXISTS (SELECT 1 FROM biometric_punches));
  PERFORM pg_temp.t('agent_reads_shift_timings', EXISTS (SELECT 1 FROM org_shift_timings));
  BEGIN INSERT INTO biometric_punches (employee_code, punched_at, source) VALUES ('101', now(), 'import');
    PERFORM pg_temp.t('agent_cannot_insert_punch', false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.t('agent_cannot_insert_punch', true); END;
  UPDATE org_shift_timings SET start_minute = 0; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.t('agent_cannot_edit_timings', n = 0, n::text);
END $t$;
SELECT pg_temp.as_user('__OTHER_ADMIN__');
DO $t$ DECLARE n int; BEGIN
  PERFORM pg_temp.t('other_org_cannot_see_device', NOT EXISTS (SELECT 1 FROM biometric_devices WHERE id = (SELECT id FROM _x WHERE k='dev')));
  PERFORM pg_temp.t('other_org_cannot_see_punches', NOT EXISTS (SELECT 1 FROM biometric_punches WHERE employee_code = '101' AND punched_at = '2026-11-18 03:35:00+00'));
  BEGIN INSERT INTO biometric_devices (name, serial_number) VALUES ('Steal', 'TESTSN0001');
    PERFORM pg_temp.t('serial_unique_across_orgs', false); EXCEPTION WHEN unique_violation THEN PERFORM pg_temp.t('serial_unique_across_orgs', true); END;
END $t$;
RESET ROLE;
UPDATE profiles SET biometric_code = '101' WHERE id = '__ADMIN__';
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('__ADMIN__');
DO $t$ DECLARE r record; BEGIN
  SELECT * INTO r FROM biometric_daily('2026-11-01') WHERE agent_id = '__ADMIN__';
  PERFORM pg_temp.t('daily_summary_maps_code_to_employee', r.day = '2026-11-18' AND r.n = 1, coalesce(r.day::text,'none'));
END $t$;
SELECT pg_temp.as_user('__AGENT__');
SELECT pg_temp.t('agent_daily_summary_empty', NOT EXISTS (SELECT 1 FROM biometric_daily('2026-11-01')));
SELECT pg_temp.as_user('__OTHER_ADMIN__');
SELECT pg_temp.t('other_org_daily_summary_empty', NOT EXISTS (SELECT 1 FROM biometric_daily('2026-11-01') WHERE agent_id = '__ADMIN__'));
RESET ROLE;
DO $t$ BEGIN
  INSERT INTO api_keys (org_id, name, prefix, key_hash, scopes) SELECT id, 't', 'cc_t', 'h_test_x', ARRAY['attendance:write'] FROM organizations LIMIT 1;
  PERFORM pg_temp.t('attendance_scope_allowed', true);
  BEGIN INSERT INTO api_keys (org_id, name, prefix, key_hash, scopes) SELECT id, 't', 'cc_t', 'h_test_y', ARRAY['root'] FROM organizations LIMIT 1;
    PERFORM pg_temp.t('unknown_scope_rejected', false); EXCEPTION WHEN check_violation THEN PERFORM pg_temp.t('unknown_scope_rejected', true); END;
END $t$;
SELECT json_agg(_r ORDER BY n) AS results FROM _r;
ROLLBACK;
