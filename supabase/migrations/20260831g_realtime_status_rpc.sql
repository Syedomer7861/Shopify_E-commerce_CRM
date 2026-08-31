-- Lets the System Health page show which tables are still on the Realtime
-- publication (and how many) without granting catalog access to the app role.
-- Locked to the service_role the /api/admin/system-health route uses.

CREATE OR REPLACE FUNCTION public.realtime_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'count', (SELECT count(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime'),
    'tables', COALESCE(
      (SELECT jsonb_agg(tablename ORDER BY tablename)
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public'),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION public.realtime_status() FROM public;
GRANT EXECUTE ON FUNCTION public.realtime_status() TO service_role;
