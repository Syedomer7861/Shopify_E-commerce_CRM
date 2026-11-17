-- DRAFT, not applied. Additive only: two nullable columns, one index, one RESTRICTIVE guard.
-- 1) call_logs.agent_id: who logged the call. Filled by default from the caller's session,
--    so the existing app inserts need no change. Old rows stay NULL (no guessing from agent_name).
--    Cron jobs use the service client (no auth.uid()), so their rows stay NULL too.
-- 2) leaves.leave_type: optional; NULL = not specified (existing rows are not relabelled).
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS call_logs_agent_called_idx ON public.call_logs (agent_id, called_at DESC);

-- Members may only log calls as themselves (or leave it empty); admins may set anyone.
DROP POLICY IF EXISTS call_logs_agent_is_self ON public.call_logs;
CREATE POLICY call_logs_agent_is_self ON public.call_logs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (agent_id IS NULL OR agent_id = auth.uid() OR public.is_admin());

ALTER TABLE public.leaves
  ADD COLUMN IF NOT EXISTS leave_type text
  CHECK (leave_type IS NULL OR leave_type IN ('casual', 'sick', 'annual', 'unpaid', 'other'));

-- Rollback (if ever needed):
-- DROP POLICY IF EXISTS call_logs_agent_is_self ON public.call_logs;
-- DROP INDEX IF EXISTS call_logs_agent_called_idx;
-- ALTER TABLE public.call_logs DROP COLUMN IF EXISTS agent_id;
-- ALTER TABLE public.leaves DROP COLUMN IF EXISTS leave_type;
