-- ============================================================
-- CureForever CRM — Phase 2: WhatsApp Cloud API Hardening
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Settings Hardening
ALTER TABLE settings ADD COLUMN IF NOT EXISTS whatsapp_verify_token VARCHAR(255);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS meta_review_name VARCHAR(255);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS meta_reorder_name VARCHAR(255);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS meta_recovery_name VARCHAR(255);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS meta_final_name VARCHAR(255);

-- 2. Template Mapping
ALTER TABLE campaign_templates ADD COLUMN IF NOT EXISTS meta_template_name VARCHAR(255);
ALTER TABLE campaign_templates ADD COLUMN IF NOT EXISTS meta_variable_mapping JSONB DEFAULT '[]'; -- Array of CRM variable names in order: ["name", "product"]

-- 3. Message History Table
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    phone VARCHAR(20) NOT NULL,
    body TEXT,
    type VARCHAR(20) DEFAULT 'text', -- 'text', 'image', 'template', 'interactive'
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    status VARCHAR(20) DEFAULT 'sent', -- 'sent', 'delivered', 'read', 'failed'
    meta_message_id VARCHAR(255) UNIQUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_customer ON whatsapp_messages (customer_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages (phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created ON whatsapp_messages (created_at DESC);

-- 4. Enable RLS
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_messages" ON whatsapp_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Seed Example Mapping (assuming 'Review Reminder' exists)
UPDATE campaign_templates 
SET 
  meta_template_name = 'review_v1', 
  meta_variable_mapping = '["name", "product"]'::jsonb
WHERE name = 'Review Reminder';
