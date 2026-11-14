-- Role permission matrix inside one workspace. Read-safe: the block ALWAYS
-- ends in RAISE EXCEPTION, so every change it makes is rolled back.
-- Run: npm run check:role-matrix
--
-- For one real user of each role (largest workspace first), on each
-- sensitive table: rows visible / rows in the workspace, and W when the role
-- can UPDATE a row. Then privilege-escalation probes on the user's own
-- profile (role -> admin, org_id -> another workspace).
-- Output: "ROLE_MATRIX role: table=visible/total[W] ... | esc=..." per role.
DO $$
DECLARE
  tabs text[] := ARRAY['settings','api_keys','webhook_endpoints','billing_checkouts',
    'org_subscriptions','platform_payments','platform_org_notes','payroll_runs',
    'salary_revisions','performance_reviews','grievances','leaves','expenses',
    'invoices','roles','org_module_overrides','feature_flag_orgs','audit_logs',
    'personal_notes','personal_todos','profiles','customers','orders'];
  u record; t text; total int; vis int; n int; line text; outp text := '';
  other uuid; r record;
BEGIN
  FOR u IN
    SELECT DISTINCT ON (p.role) p.id, p.org_id, p.role, au.email
    FROM profiles p JOIN auth.users au ON au.id = p.id
    WHERE p.org_id IS NOT NULL AND p.role <> 'admin'
    ORDER BY p.role, (SELECT count(*) FROM profiles q WHERE q.org_id = p.org_id) DESC
  LOOP
    line := u.role || ':';
    FOREACH t IN ARRAY tabs LOOP
      RESET ROLE;
      EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', t) INTO total USING u.org_id;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', u.id, 'role', 'authenticated', 'email', u.email)::text, true);
      SET LOCAL ROLE authenticated;
      BEGIN
        EXECUTE format('SELECT count(*) FROM public.%I', t) INTO vis;
      EXCEPTION WHEN OTHERS THEN vis := -1;
      END;
      n := 0;
      BEGIN
        EXECUTE format('UPDATE public.%I SET org_id = org_id WHERE ctid IN (SELECT ctid FROM public.%I LIMIT 1)', t, t);
        GET DIAGNOSTICS n = ROW_COUNT;
      EXCEPTION WHEN OTHERS THEN n := 0;
      END;
      IF vis <> 0 OR n > 0 THEN
        line := line || ' ' || t || '=' || vis || '/' || total || CASE WHEN n > 0 THEN 'W' ELSE '' END;
      END IF;
    END LOOP;

    -- Escalation probes on own profile.
    SELECT id INTO other FROM organizations WHERE id <> u.org_id LIMIT 1;
    BEGIN UPDATE profiles SET role = 'admin' WHERE id = u.id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN UPDATE profiles SET org_id = other WHERE id = u.id; EXCEPTION WHEN OTHERS THEN NULL; END;
    RESET ROLE;
    SELECT role, org_id INTO r FROM profiles WHERE id = u.id;
    line := line || ' | esc_role=' || CASE WHEN r.role = 'admin' THEN 'LEAK' ELSE 'blocked' END
                 || ' esc_org=' || CASE WHEN r.org_id IS DISTINCT FROM u.org_id THEN 'LEAK' ELSE 'blocked' END;
    -- Undo within the transaction so the next role starts clean (all rolled back anyway).
    UPDATE profiles SET role = u.role, org_id = u.org_id WHERE id = u.id;
    outp := outp || ' ## ' || line;
  END LOOP;
  RAISE EXCEPTION 'ROLE_MATRIX%', outp;
END $$;
