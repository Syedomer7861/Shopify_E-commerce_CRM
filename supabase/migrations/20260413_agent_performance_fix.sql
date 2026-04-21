-- ============================================================
-- CureForever CRM — Agent Presence & Performance Accuracy Fix
-- Run this in Supabase SQL Editor
-- ============================================================

-- Fix the agent performance view to read from the definitive call_logs table 
-- instead of the incomplete agent_activity_logs table, matching the Analytics page.

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
    COALESCE(am.total_calls, 0) as total_calls,
    COALESCE(am.total_whatsapp, 0) as total_whatsapp,
    COALESCE(am.tasks_resolved, 0) as tasks_resolved,
    COALESCE(am.revenue_recovered, 0) as revenue_recovered,
    p.weekly_revenue_target
FROM profiles p
LEFT JOIN activity_metrics am ON LOWER(p.email) = am.agent_email
GROUP BY p.id, p.name, p.email, p.role, p.is_active, p.last_seen_at, p.avatar_url, p.weekly_revenue_target, am.total_calls, am.total_whatsapp, am.tasks_resolved, am.revenue_recovered;
