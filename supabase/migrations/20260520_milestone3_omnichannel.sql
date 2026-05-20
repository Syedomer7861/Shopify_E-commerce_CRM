-- Migration: Add Click-to-Call and SMS Fallback columns to settings table
-- Date: 2026-05-20
-- Milestone 3: Scale & Omnichannel Presence

-- Click-to-Call Telephony Settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telephony_provider VARCHAR(50) DEFAULT 'none';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS twilio_account_sid VARCHAR(255) DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS twilio_auth_token VARCHAR(255) DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS twilio_caller_id VARCHAR(50) DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS exotel_sid VARCHAR(255) DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS exotel_token VARCHAR(255) DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS exotel_caller_id VARCHAR(50) DEFAULT '';

-- SMS Fallback Settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS sms_fallback_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS sms_provider VARCHAR(50) DEFAULT 'twilio';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS sms_twilio_sid VARCHAR(255) DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS sms_twilio_token VARCHAR(255) DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS sms_twilio_number VARCHAR(50) DEFAULT '';

-- Comments to document
COMMENT ON COLUMN public.settings.telephony_provider IS 'Telephony provider: none, twilio, exotel';
COMMENT ON COLUMN public.settings.sms_fallback_enabled IS 'If true, automatically send an SMS when WhatsApp messaging fails';
