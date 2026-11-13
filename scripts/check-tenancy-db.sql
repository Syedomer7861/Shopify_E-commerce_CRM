-- Read-only tenant-isolation audit. Every row returned is a problem.
-- Run: npm run check:tenancy-db   (uses the linked Supabase project, read-only)
--
-- 1. Table with org_id but row security off.
SELECT 'rls_off' AS problem, c.relname AS tbl, NULL::text AS policy
FROM pg_class c
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT c.relrowsecurity
UNION ALL
-- 2. A rule that lets anyone through (USING true / WITH CHECK true) for signed-in or anonymous users.
SELECT 'open_policy', p.tablename, p.policyname
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND (p.qual = 'true' OR p.with_check = 'true')
  AND p.roles && ARRAY['public', 'anon', 'authenticated']::name[]
UNION ALL
-- 3. A widening (permissive) rule on an org_id table that never checks the
--    organisation. Restrictive rules only narrow access, so they are skipped.
--    Allowed: org checks, own-row checks, and helpers that check the org
--    themselves (can_reach, can_access_space, is_space_owner).
SELECT 'no_org_check', p.tablename, p.policyname
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename AND c.relnamespace = 'public'::regnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
WHERE p.schemaname = 'public'
  AND p.permissive = 'PERMISSIVE'
  AND p.roles && ARRAY['public', 'anon', 'authenticated']::name[]
  AND coalesce(p.qual, '') || coalesce(p.with_check, '') !~ '(current_org_id|org_id|is_platform_admin|is_platform_owner_verified|can_reach|can_access_space|is_space_owner|auth\.uid\(\) = user_id|user_id = auth\.uid\(\))'
UNION ALL
-- 4. Privileged function callable without signing in.
SELECT 'anon_definer_fn', p.proname, NULL
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'execute')
ORDER BY 1, 2, 3;
