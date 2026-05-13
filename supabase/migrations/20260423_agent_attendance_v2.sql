-- Update Agent Attendance Schema for v2
-- Adds reason codes and support for expanded statuses

-- 1. Add reason column to agent_attendance
ALTER TABLE agent_attendance ADD COLUMN IF NOT EXISTS reason TEXT;

-- 2. Add avatar_url and targets to profiles for the Floor View
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weekly_revenue_target DECIMAL DEFAULT 0;

-- 3. Update v_agent_performance to handle new statuses (Optional, but good for consistency)
-- This view is used in some parts of the admin dashboard
CREATE OR REPLACE VIEW v_agent_performance AS
WITH activity_metrics AS (
    SELECT 
        LOWER(cl.agent_name) as agent_email,
        COUNT(cl.id) as total_calls,
        COUNT(cl.id) FILTER (WHERE cl.outcome = 'whatsapp') as total_whatsapp,
        COUNT(DISTINCT cl.task_id) FILTER (WHERE cl.outcome = 'done') as tasks_resolved,
        COALESCE(SUM(CASE WHEN cl.outcome = 'done' THEN o.total_price ELSE 0 END), 0) as revenue_recovered
    FROM call_logs cl
    LEFT JOIN tasks t ON cl.task_id = t.id
    LEFT JOIN orders o ON t.order_id = o.id
    GROUP BY LOWER(cl.agent_name)
)
SELECT 
    p.id as agent_id,
    COALESCE(NULLIF(p.name, ''), p.email) as name,
    p.email,
    p.role,
    p.is_active,
    p.last_seen_at,
    p.avatar_url,
    p.status,
    COALESCE(am.total_calls, 0) as total_calls,
    COALESCE(am.total_whatsapp, 0) as total_whatsapp,
    COALESCE(am.tasks_resolved, 0) as tasks_resolved,
    COALESCE(am.revenue_recovered, 0) as revenue_recovered,
    p.weekly_revenue_target
FROM profiles p
LEFT JOIN activity_metrics am ON LOWER(p.email) = am.agent_email;
