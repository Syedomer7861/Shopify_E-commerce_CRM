-- ============================================================
-- CureForever CRM — Phase 3: Campaign Execution Engine
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Workflows Definition
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    trigger_event VARCHAR(50) NOT NULL, -- 'order_placed', 'order_delivered', 'cart_abandoned'
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Workflow Steps
CREATE TABLE IF NOT EXISTS workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'delay', 'message', 'task', 'tag'
    params JSONB DEFAULT '{}', -- { delay_days: 2 } or { template_name: 'review_v1' }
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workflow_id, step_order)
);

-- 3. Active Workflow Instances
CREATE TABLE IF NOT EXISTS workflow_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    current_step_id UUID REFERENCES workflow_steps(id) ON DELETE SET NULL,
    next_run_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'cancelled'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Workflow Logs & Analytics
CREATE TABLE IF NOT EXISTS workflow_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES workflow_instances(id) ON DELETE CASCADE,
    step_id UUID REFERENCES workflow_steps(id) ON DELETE SET NULL,
    action_type VARCHAR(20),
    status VARCHAR(20), -- 'success', 'failed'
    payload JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Seed: Default Review Request Workflow (3 days after delivery)
DO $$
DECLARE
    wf_id UUID;
BEGIN
    -- Only seed if not exists
    IF NOT EXISTS (SELECT 1 FROM workflows WHERE name = 'Default Review Request') THEN
        INSERT INTO workflows (name, trigger_event, description)
        VALUES ('Default Review Request', 'order_delivered', 'Auto-request review 3 days after delivery')
        RETURNING id INTO wf_id;

        -- Step 1: Wait 3 days
        INSERT INTO workflow_steps (workflow_id, step_order, type, params)
        VALUES (wf_id, 1, 'delay', '{"delay_days": 3}'::jsonb);

        -- Step 2: Send WhatsApp Message
        INSERT INTO workflow_steps (workflow_id, step_order, type, params)
        VALUES (wf_id, 2, 'message', '{"template_name": "Review Reminder"}'::jsonb);
    END IF;
END $$;

-- 6. Enable RLS
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_workflows" ON workflows FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all_steps" ON workflow_steps FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all_instances" ON workflow_instances FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all_logs" ON workflow_logs FOR ALL TO authenticated USING (true);
