-- ============================================================
-- CureForever CRM — Scaling Infrastructure Migration
-- Phase 1 & 2 Foundations
-- ============================================================

-- 1. Agent Activity Logs (Dashboard Support)
CREATE TABLE IF NOT EXISTS agent_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('call', 'whatsapp', 'task_completion', 'login')),
    reference_id UUID, -- Can be task_id, order_id, etc.
    note TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Lead Scoring (Lead Intelligence Support)
CREATE TABLE IF NOT EXISTS lead_scores (
    customer_id UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    factors JSONB NOT NULL DEFAULT '[]', -- Rationale for the score
    last_calculated_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Campaign Templates (Variable-based Messaging)
CREATE TABLE IF NOT EXISTS campaign_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    body TEXT NOT NULL,
    category VARCHAR(50) CHECK (category IN ('recovery', 'reorder', 'feedback', 'marketing', 'custom')),
    variables JSONB DEFAULT '[]', -- Expected variable placeholders
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Campaigns (Broadcast & Marketing Engine)
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    template_id UUID REFERENCES campaign_templates(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'paused', 'failed')),
    target_segment VARCHAR(50),
    total_recipients INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Automation Workflows (Rule Engine)
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    trigger_event VARCHAR(100) NOT NULL, -- e.g., 'shopify_order_created', 'task_overdue'
    conditions JSONB DEFAULT '[]',       -- Array of predicates
    actions JSONB DEFAULT '[]',          -- Array of steps (send_wa, create_task)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Automation Logs (Audit Trail for Workflows)
CREATE TABLE IF NOT EXISTS workflow_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    entity_id UUID,                     -- The record that triggered it
    status VARCHAR(20) CHECK (status IN ('success', 'failed', 'skipped')),
    details JSONB DEFAULT '{}',
    executed_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Task Enhancements (Auto-Assignment)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(20) DEFAULT 'manual' CHECK (assignment_type IN ('manual', 'auto'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 8. Profile Enhancements (Multi-Agent KPIs)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weekly_revenue_target DECIMAL(10,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 9. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_agent_activity_agent_date ON agent_activity_logs (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_lead_scores_score ON lead_scores (score DESC);

-- 10. Agent Performance View
CREATE OR REPLACE VIEW v_agent_performance AS
SELECT 
    p.id as agent_id,
    p.name,
    p.role,
    COUNT(aal.id) FILTER (WHERE aal.activity_type = 'call') as total_calls,
    COUNT(aal.id) FILTER (WHERE aal.activity_type = 'whatsapp') as total_whatsapp,
    COUNT(t.id) FILTER (WHERE t.status = 'done') as tasks_resolved,
    COALESCE(SUM((aal.metadata->>'revenue')::numeric), 0) as revenue_recovered,
    p.weekly_revenue_target
FROM profiles p
LEFT JOIN agent_activity_logs aal ON p.id = aal.agent_id
LEFT JOIN tasks t ON p.id = t.assigned_to
WHERE p.is_active = true
GROUP BY p.id, p.name, p.role, p.weekly_revenue_target;

-- 11. Cleanup logic for triggers
CREATE TRIGGER lead_scores_updated_at BEFORE UPDATE ON lead_scores FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER campaign_templates_updated_at BEFORE UPDATE ON campaign_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at();
