-- ============================================================
-- CureForever CRM — WhatsApp Automation Settings
-- ============================================================

-- 1. Automation Flags
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_auto_welcome BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_auto_order_placed BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_auto_order_transit BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_auto_order_delivered BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_auto_cart_abandoned BOOLEAN DEFAULT false;

-- 2. Custom Templates
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_welcome_template TEXT DEFAULT 'Hi {{name}} 👋, welcome to CureForever! We are excited to have you on board. 🌿';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_order_placed_template TEXT DEFAULT 'Hi {{name}} 👋, your order #{{order_no}} has been placed successfully! 🛒 We will notify you when it ships.';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_order_transit_template TEXT DEFAULT 'Hi {{name}} 👋, your order #{{order_no}} is now in transit! 🚚 You can track it here: {{tracking_link}}';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_order_delivered_template TEXT DEFAULT 'Hi {{name}} 👋, your order #{{order_no}} has been delivered! 🎁 How was your experience? We would love to hear your feedback.';

-- 3. Anti-Ban Speed Settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_speed_preset TEXT DEFAULT 'safe';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_min_delay INTEGER DEFAULT 30;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_max_delay INTEGER DEFAULT 90;

