-- ============================================================
-- CureForever CRM — Seed Default Workflow Presets
-- Run this in your Supabase SQL Editor
-- ============================================================

INSERT INTO workflows (name, trigger_event, is_active, conditions, actions)
VALUES 
(
  'Urgent RTO Escalation', 
  'order_rto', 
  true,
  '[]'::jsonb,
  '[{"type": "create_task", "params": {"task_type": "issue_resolution", "delay_days": 0, "priority_bonus": 200}}, {"type": "add_tag", "params": {"tag": "RTO_Risk"}}]'::jsonb
),
(
  'High-Value Cart Rescue', 
  'cart_abandoned', 
  true,
  '[{"field": "total_price", "operator": ">=", "value": 3000}]'::jsonb,
  '[{"type": "create_task", "params": {"task_type": "recovery", "delay_days": 0, "priority_bonus": 100}}]'::jsonb
),
(
  'VIP 5-Star Experience', 
  'order_delivered', 
  true,
  '[{"field": "customer.total_orders", "operator": ">=", "value": 5}]'::jsonb,
  '[{"type": "add_tag", "params": {"tag": "VIP_Customer"}}, {"type": "create_task", "params": {"task_type": "review", "delay_days": 2, "priority_bonus": 50}}]'::jsonb
),
(
  'Standard Delivery Follow-up', 
  'order_delivered', 
  true,
  '[]'::jsonb,
  '[{"type": "create_task", "params": {"task_type": "review", "delay_days": 5, "priority_bonus": 0}}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
