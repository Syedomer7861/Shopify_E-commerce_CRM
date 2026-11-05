-- CRITICAL FIX: found via a real cross-tenant leak during Phase 6a testing.
-- 7 tables each still carried an old, never-actually-dropped permissive
-- policy (USING true), coexisting with Phase 1's properly org-scoped
-- policies on the SAME tables. Postgres combines multiple PERMISSIVE
-- policies for the same command with OR, so these 7 alone granted full
-- access regardless of org, silently defeating every org_id check built
-- this session. The migration files that were supposed to drop these
-- (e.g. 20260413_phase4_ecosystem.sql's `DROP POLICY IF EXISTS "auth_all"
-- ON customers`) apparently never actually ran against this prod database
-- in that form - consistent with this project's history of ad-hoc,
-- hand-applied migrations with gaps (see [[supabase-migration-workflow]]).
--
-- This never showed up in any "verify as admin" check this session,
-- because a real CureForever admin passes the CORRECT org-scoped policy
-- regardless of whether this leftover one also exists - the leak is only
-- visible from an account that doesn't match any legitimate policy, which
-- is exactly what the Phase 6a signup test (a brand-new org's admin)
-- accidentally exercised for the first time.
--
-- Confirmed via a direct pg_policy audit (every policy across the whole
-- schema with USING = 'true', filtered to ones actually reachable by
-- authenticated/anon - the service_role-only ones are harmless, since
-- service_role already bypasses RLS regardless of policy content).

DROP POLICY IF EXISTS "Allow all" ON abandoned_carts;
DROP POLICY IF EXISTS "auth_read_all" ON agent_attendance;
DROP POLICY IF EXISTS "auth_all" ON call_logs;
DROP POLICY IF EXISTS "auth_all" ON customers;
DROP POLICY IF EXISTS "auth_all" ON leaves;
DROP POLICY IF EXISTS "auth_all" ON orders;
DROP POLICY IF EXISTS "auth_all" ON tasks;
