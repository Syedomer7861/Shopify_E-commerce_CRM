-- Migration: Create pincode_metrics table
CREATE TABLE IF NOT EXISTS public.pincode_metrics (
  pincode      VARCHAR(20) PRIMARY KEY,
  avg_rto_rate INTEGER NOT NULL DEFAULT 0,
  best_carrier VARCHAR(100) DEFAULT 'Delhivery',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pincode_metrics ENABLE ROW LEVEL SECURITY;

-- Add RLS policy
DROP POLICY IF EXISTS auth_all ON public.pincode_metrics;
CREATE POLICY auth_all ON public.pincode_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);
