-- Organisation dashboard: workforce counts aggregated in the database, so the
-- page never downloads the employee list to draw cards and charts.
--
-- SECURITY INVOKER: profiles RLS decides what the caller can count. An admin
-- sees the whole organisation; anyone else only the rows they may read.
-- Additive only. Rollback: DROP FUNCTION IF EXISTS public.org_workforce_summary();
BEGIN;

CREATE OR REPLACE FUNCTION public.org_workforce_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH p AS (
    SELECT id, is_active, department_id, branch_id, designation_id, manager_id, role,
           employment_type, work_arrangement, employment_status, joining_date
      FROM profiles
     WHERE org_id = public.current_org_id() AND coalesce(is_demo, false) = false
  ),
  grp AS (
    SELECT 'department' AS dim, department_id::text AS k, count(*) AS n FROM p WHERE is_active GROUP BY 2
    UNION ALL SELECT 'branch', branch_id::text, count(*) FROM p WHERE is_active GROUP BY 2
    UNION ALL SELECT 'designation', designation_id::text, count(*) FROM p WHERE is_active GROUP BY 2
    UNION ALL SELECT 'employment_type', employment_type, count(*) FROM p WHERE is_active GROUP BY 2
    UNION ALL SELECT 'work_arrangement', work_arrangement, count(*) FROM p WHERE is_active GROUP BY 2
    UNION ALL SELECT 'employment_status', employment_status, count(*) FROM p WHERE is_active GROUP BY 2
    UNION ALL SELECT 'role', role, count(*) FROM p WHERE is_active GROUP BY 2
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM p),
    'active', (SELECT count(*) FROM p WHERE is_active),
    'with_manager', (SELECT count(*) FROM p WHERE is_active AND manager_id IS NOT NULL),
    'with_department', (SELECT count(*) FROM p WHERE is_active AND department_id IS NOT NULL),
    'joined_30d', (SELECT count(*) FROM p WHERE joining_date > current_date - 30 AND joining_date <= current_date),
    'joined_prev_30d', (SELECT count(*) FROM p WHERE joining_date > current_date - 60 AND joining_date <= current_date - 30),
    'with_joining_date', (SELECT count(*) FROM p WHERE joining_date IS NOT NULL),
    'groups', coalesce((SELECT jsonb_agg(jsonb_build_object('dim', dim, 'key', k, 'n', n)) FROM grp), '[]'::jsonb)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.org_workforce_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_workforce_summary() TO authenticated;

COMMIT;
