-- v_agent_performance (20260826g) never exposed org_id, so daily-digest's
-- leaderboard query (service-role, bypasses RLS on the underlying tables
-- regardless) mixed every org's agents together. Adding org_id to the
-- view's own output lets callers filter it like any other query.
CREATE OR REPLACE VIEW v_agent_performance AS
WITH activity_metrics AS (
    SELECT
        LOWER(cl.agent_name) as agent_email,
        COUNT(cl.id) as total_calls,
        COUNT(cl.id) FILTER (WHERE cl.outcome = 'whatsapp') as total_whatsapp,
        COUNT(DISTINCT cl.task_id) FILTER (WHERE cl.outcome = 'done') as tasks_resolved,
        COALESCE(SUM(CASE WHEN cl.outcome = 'done' THEN COALESCE(o.total_price, ac.total_price, 0) ELSE 0 END), 0) as revenue_recovered
    FROM call_logs cl
    LEFT JOIN tasks t ON cl.task_id = t.id
    LEFT JOIN orders o ON t.order_id = o.id
    LEFT JOIN abandoned_carts ac ON t.abandoned_cart_id = ac.id
    GROUP BY LOWER(cl.agent_name)
)
SELECT
    p.id as agent_id,
    p.org_id,
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
