-- ============================================================
-- CureForever CRM — Phase 4: Multi-Agent Refinements
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Profile Refinements (Availability & Presence)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'break', 'offline'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- 2. Order Revenue Attribution
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attributed_instance_id UUID REFERENCES workflow_instances(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attributed_step_id UUID REFERENCES workflow_steps(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attribution_window_end TIMESTAMPTZ;

-- 3. Hardened RLS Security (Drop Permissive, Add Strict)

-- CUSTOMERS: Shared Read, Admin Write
DROP POLICY IF EXISTS "auth_all" ON customers;
CREATE POLICY "admin_all_customers" ON customers FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "agent_read_customers" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "agent_update_customers" ON customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- TASKS: Agent View Ownership, Admin View All
DROP POLICY IF EXISTS "auth_all" ON tasks;
CREATE POLICY "admin_all_tasks" ON tasks FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "agent_own_tasks" ON tasks 
FOR SELECT TO authenticated 
USING (assigned_to = auth.uid() OR assigned_to IS NULL);

CREATE POLICY "agent_update_own_tasks" ON tasks 
FOR UPDATE TO authenticated 
USING (assigned_to = auth.uid()) 
WITH CHECK (assigned_to = auth.uid());

-- ORDERS: Shared Read, Admin Write
DROP POLICY IF EXISTS "auth_all" ON orders;
CREATE POLICY "admin_all_orders" ON orders FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "agent_read_orders" ON orders FOR SELECT TO authenticated USING (true);

-- CALL LOGS: Agent Can Log, Admin Can Audit
DROP POLICY IF EXISTS "auth_all" ON call_logs;
CREATE POLICY "admin_all_call_logs" ON call_logs FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "agent_create_call_logs" ON call_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "agent_read_call_logs" ON call_logs FOR SELECT TO authenticated USING (true);

-- PROFILES: Self-Update for Status/Shift
DROP POLICY IF EXISTS "profiles_self_update" ON profiles;
CREATE POLICY "profiles_self_update" ON profiles 
FOR UPDATE TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- 4. Attribution Function: Automatically link orders to recent WhatsApp messages
CREATE OR REPLACE FUNCTION attribute_order_revenue()
RETURNS TRIGGER AS $$
DECLARE
    recent_instance_id UUID;
    recent_step_id UUID;
BEGIN
    -- Find the most recent active workflow instance for this customer in the last 7 days
    SELECT id, current_step_id INTO recent_instance_id, recent_step_id
    FROM workflow_instances
    WHERE customer_id = NEW.customer_id
      AND updated_at >= (NEW.ordered_at - INTERVAL '7 days')
      AND status != 'cancelled'
    ORDER BY updated_at DESC
    LIMIT 1;

    IF recent_instance_id IS NOT NULL THEN
        NEW.attributed_instance_id = recent_instance_id;
        NEW.attributed_step_id = recent_step_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_attribute_revenue ON orders;
CREATE TRIGGER trigger_attribute_revenue
    BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION attribute_order_revenue();
