-- Tenant write-isolation probe. Read-safe: the whole block ALWAYS ends in
-- RAISE EXCEPTION, so every change it makes is rolled back.
-- Run: npm run check:tenancy-writes
--
-- Signs in (inside the transaction only) as a NON-admin member, then on every
-- public table with org_id tries to UPDATE and DELETE one row belonging to
-- another organisation. Any row affected = a cross-tenant write leak.
-- Output line: "TENANCY_WRITES ok tables=N" or "TENANCY_WRITES LEAK ...".
--
-- A non-admin on purpose: an admin can't reveal a permissive leftover policy
-- (see memory note "RLS verification blind spot").
DO $$
DECLARE
  me record;
  t text;
  n int;
  checked int := 0;
  own_ok int := 0;
  leaks text := '';
BEGIN
  SELECT p.id, p.org_id, au.email INTO me
  FROM profiles p JOIN auth.users au ON au.id = p.id
  WHERE p.org_id IS NOT NULL AND p.role NOT IN ('admin', 'manager')
    AND EXISTS (SELECT 1 FROM organizations o WHERE o.id <> p.org_id)
  ORDER BY p.created_at LIMIT 1;
  IF me.id IS NULL THEN RAISE EXCEPTION 'TENANCY_WRITES skip: no non-admin member found'; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', me.id, 'role', 'authenticated', 'email', me.email)::text, true);
  SET LOCAL ROLE authenticated;

  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
    ORDER BY 1
  LOOP
    checked := checked + 1;
    BEGIN
      EXECUTE format('UPDATE public.%I SET org_id = org_id WHERE ctid IN (SELECT ctid FROM public.%I WHERE org_id IS DISTINCT FROM $1 LIMIT 1)', t, t)
        USING me.org_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN leaks := leaks || t || ':update '; END IF;
    EXCEPTION WHEN OTHERS THEN NULL; -- permission denied etc. = blocked, good
    END;
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE ctid IN (SELECT ctid FROM public.%I WHERE org_id IS DISTINCT FROM $1 LIMIT 1)', t, t)
        USING me.org_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN leaks := leaks || t || ':delete '; END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    -- Positive control: the same statement on an own-org row must work
    -- somewhere, or "no leaks" would just mean the probe never wrote at all.
    BEGIN
      EXECUTE format('UPDATE public.%I SET org_id = org_id WHERE ctid IN (SELECT ctid FROM public.%I WHERE org_id = $1 LIMIT 1)', t, t)
        USING me.org_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN own_ok := own_ok + 1; END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  IF own_ok = 0 THEN RAISE EXCEPTION 'TENANCY_WRITES broken: probe could not write even own-org rows'; END IF;

  RESET ROLE;
  IF leaks = '' THEN
    RAISE EXCEPTION 'TENANCY_WRITES ok tables=% own_writable=% role=%', checked, own_ok, (SELECT role FROM profiles WHERE id = me.id);
  END IF;
  RAISE EXCEPTION 'TENANCY_WRITES LEAK tables=% leaks=%', checked, leaks;
END $$;
