-- SECURITY HOTFIX. Found by a live probe on 2026-11-11: v_agent_performance
-- returns all 17 rows (every org's agent names, emails, call counts and
-- recovered revenue) to a caller holding only the public anon key - i.e.
-- logged out - and to any signed-in user of any other org.
--
-- Cause: a Postgres view runs with its OWNER's rights by default, so the
-- org-scoped RLS on profiles/call_logs/tasks/orders underneath is never
-- consulted, and the default Supabase grants let anon SELECT it. Every
-- other table/view passed the same probe; this is the one exception.
--
-- security_invoker makes the view obey the caller's own RLS (an org member
-- sees their org; service-role callers such as the daily-digest cron are
-- unaffected). The REVOKE removes logged-out access outright.

ALTER VIEW public.v_agent_performance SET (security_invoker = true);
REVOKE ALL ON public.v_agent_performance FROM anon;

-- Verify after applying (run as-is in the SQL Editor; expect 0 for anon):
--   SET ROLE anon; SELECT count(*) FROM v_agent_performance; RESET ROLE;
