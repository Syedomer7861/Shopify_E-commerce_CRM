-- ============================================================
-- CureForever CRM — Phase 1: Smart Caching for External APIs
-- Run this in your Supabase SQL Editor
-- ============================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS shiprocket_token TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS shiprocket_token_expires_at TIMESTAMPTZ;
