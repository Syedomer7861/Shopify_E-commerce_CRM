-- ============================================================
-- Trim the Realtime publication to stop firehose tables broadcasting.
--
-- The org is at its Free-plan Realtime cap (~2M messages / cycle). Every
-- write to a table in `supabase_realtime` is delivered as one Realtime
-- message PER subscribed client. A few log/event tables (webhook_logs
-- especially — every Shopify/Shiprocket webhook) fan out to every dashboard
-- viewer and dominate that number.
--
-- Removing a table here does NOT break anything: client .on('postgres_changes')
-- subscriptions on it simply stop receiving events. The affected pages
-- (LivePulseFeed, CallMonitor, admin-logs, announcements, abandoned-carts,
-- HR) already poll or have a manual refresh; LivePulseFeed and CallMonitor
-- were converted to polling in the same change set.
--
-- Kept in the publication (real, low-volume, user-facing value):
--   messages, notifications, channels, channel_members   (chat + bell)
--   tasks, orders, customers, mkt_tasks                   (live boards)
--
-- Reversible: `ALTER PUBLICATION supabase_realtime ADD TABLE <name>;`
--
-- To see the current list first:
--   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY 1;
-- ============================================================

DO $$
DECLARE
  t text;
  drop_list text[] := ARRAY[
    'webhook_logs',
    'agent_activity_logs',
    'call_logs',
    'raw_call_logs',
    'audit_logs',
    'abandoned_carts',
    'announcements',
    'agent_status_logs',
    'leave_requests',
    'settings'
  ];
BEGIN
  FOREACH t IN ARRAY drop_list LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
      RAISE NOTICE 'dropped % from supabase_realtime', t;
    END IF;
  END LOOP;
END $$;
