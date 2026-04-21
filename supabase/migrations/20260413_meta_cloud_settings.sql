-- ============================================================
-- CureForever CRM — Phase 2: Meta WhatsApp Cloud API
-- Run this in your Supabase SQL Editor
-- ============================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS whatsapp_phone_id VARCHAR(50);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS whatsapp_app_id VARCHAR(50);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS whatsapp_app_secret VARCHAR(255);
