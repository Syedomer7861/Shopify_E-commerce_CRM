-- Super Admin system health: one read-only snapshot for the owner.
--
-- platform_health_overview() returns jsonb with:
--   db            current database size and the largest tables (db_size_stats)
--   snapshots     the last 30 daily size snapshots (egress_watch, written by the
--                 daily egress-watch job, so the newest one also shows the daily
--                 jobs ran) and their warnings
--   integrations  per webhook source: events in 24 hours, last event, failures in 7 days
--   failures      the 20 newest non-processed webhook entries (source, topic,
--                 error text cut to 300 characters; payloads are never returned)
-- Nothing is changed. Gated by platform_require_owner() (owner flag + two-factor).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.platform_health_overview();
-- Safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.platform_health_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r jsonb;
BEGIN
  PERFORM public.platform_require_owner();
  SELECT jsonb_build_object(
    'generated_at', now(),
    'db', public.db_size_stats(),
    'snapshots', coalesce((SELECT jsonb_agg(jsonb_build_object('at', captured_at, 'db_bytes', db_bytes, 'note', note) ORDER BY captured_at)
                             FROM (SELECT captured_at, db_bytes, note FROM public.egress_watch ORDER BY captured_at DESC LIMIT 30) s), '[]'::jsonb),
    'integrations', coalesce((SELECT jsonb_agg(jsonb_build_object('source', source, 'last_24h', last_24h, 'last_at', last_at, 'failed_7d', failed_7d) ORDER BY source)
                               FROM (SELECT source,
                                            count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24h,
                                            max(created_at) AS last_at,
                                            count(*) FILTER (WHERE status IS DISTINCT FROM 'processed') AS failed_7d
                                       FROM public.webhook_logs
                                      WHERE created_at > now() - interval '7 days'
                                      GROUP BY source) i), '[]'::jsonb),
    'failures', coalesce((SELECT jsonb_agg(jsonb_build_object('source', source, 'topic', topic, 'status', status,
                                   'error', left(error, 300), 'at', created_at) ORDER BY created_at DESC)
                           FROM (SELECT source, topic, status, error, created_at FROM public.webhook_logs
                                  WHERE status IS DISTINCT FROM 'processed' AND created_at > now() - interval '7 days'
                                  ORDER BY created_at DESC LIMIT 20) f), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_health_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_health_overview() TO authenticated;

COMMIT;
