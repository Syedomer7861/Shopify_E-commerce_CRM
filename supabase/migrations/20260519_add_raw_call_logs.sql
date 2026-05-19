-- Migration: Create raw_call_logs table
CREATE TABLE IF NOT EXISTS public.raw_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_phone VARCHAR(20) NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  recording_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Note: RLS policies and indexes are already managed in 20260516_hardening_suite.sql, 
-- but we ensure they exist here for completeness if run out of order.
ALTER TABLE public.raw_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manager_all_call_logs" ON public.raw_call_logs;
CREATE POLICY "admin_manager_all_call_logs" ON public.raw_call_logs 
FOR ALL TO authenticated 
USING (public.is_admin() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');

DROP POLICY IF EXISTS "agent_own_call_logs" ON public.raw_call_logs;
CREATE POLICY "agent_own_call_logs" ON public.raw_call_logs 
FOR SELECT TO authenticated 
USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "agent_insert_own_call_logs" ON public.raw_call_logs;
CREATE POLICY "agent_insert_own_call_logs" ON public.raw_call_logs 
FOR INSERT TO authenticated 
WITH CHECK (agent_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_raw_call_logs_agent_phone ON public.raw_call_logs(agent_id, customer_phone);
