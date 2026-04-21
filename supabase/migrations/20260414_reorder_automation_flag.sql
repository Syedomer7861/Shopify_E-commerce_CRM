-- ============================================================
-- CureForever CRM — Reorder/Refill Automation Setting
-- ============================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_auto_reorder BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_reorder_template TEXT DEFAULT 'Hi {{name}}! 👋 Hope you are doing well. It is time for a refill of your {{product}}. 💊 Click here to order again: cureforever.in';
