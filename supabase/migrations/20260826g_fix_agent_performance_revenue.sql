-- v_agent_performance's revenue_recovered only joined tasks -> orders, so
-- a recovery task tied to an abandoned cart (not an order) always counted
-- as ₹0 - even though the custom-date-range branch of
-- /api/dashboard/agent/route.ts (JS, not this view) already falls back to
-- abandoned_carts.total_price for exactly this case. This dashboard's
-- default view (no date range params) always uses this view, so every
-- agent's "Recovered Revenue" card was silently undercounting any recovery
-- completed via an abandoned cart rather than a direct order.
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
