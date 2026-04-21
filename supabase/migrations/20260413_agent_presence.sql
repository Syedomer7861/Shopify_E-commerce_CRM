-- ============================================================
-- CureForever CRM — Agent Presence & Heartbeat System
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add last_seen_at to profiles for presence tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- 2. Update the agent performance view to include presence data
CREATE OR REPLACE VIEW v_agent_performance AS
SELECT 
    p.id as agent_id,
    COALESCE(NULLIF(p.name, ''), p.email) as name,
    p.email,
    p.role,
    p.is_active,
    p.last_seen_at,
    p.avatar_url,
    COUNT(aal.id) FILTER (WHERE aal.activity_type = 'call') as total_calls,
    COUNT(aal.id) FILTER (WHERE aal.activity_type = 'whatsapp') as total_whatsapp,
    COUNT(t.id) FILTER (WHERE t.status = 'done') as tasks_resolved,
    COALESCE(SUM((aal.metadata->>'revenue')::numeric), 0) as revenue_recovered,
    p.weekly_revenue_target
FROM profiles p
LEFT JOIN agent_activity_logs aal ON p.id = aal.agent_id
LEFT JOIN tasks t ON p.id = t.assigned_to
GROUP BY p.id, p.name, p.email, p.role, p.is_active, p.last_seen_at, p.avatar_url, p.weekly_revenue_target;
