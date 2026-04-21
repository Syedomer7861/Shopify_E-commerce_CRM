-- ============================================================
-- CureForever CRM — Phase 5: Final Production Polish
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Intelligence Columns
ALTER TABLE customers ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 100;
ALTER TABLE product_overrides ADD COLUMN IF NOT EXISTS inventory_quantity INTEGER DEFAULT 100;

-- 2. Customer Health Calculation Function
CREATE OR REPLACE FUNCTION refresh_customer_health_scores()
RETURNS void AS $$
BEGIN
    UPDATE customers
    SET health_score = GREATEST(0, LEAST(100,
        100 
        - (CASE WHEN rto_flag THEN 40 ELSE 0 END)
        - (CASE WHEN last_order_date < (now() - INTERVAL '60 days') THEN 20 ELSE 0 END)
        + (CASE WHEN total_orders >= 5 THEN 20 ELSE 0 END)
        - (CASE WHEN rto_count > 0 THEN rto_count * 10 ELSE 0 END)
    ));
END;
$$ LANGUAGE plpgsql;

-- 3. Initial Run
SELECT refresh_customer_health_scores();
