-- Add gmail_refresh_token to settings table
ALTER TABLE settings 
  ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT;

COMMENT ON COLUMN settings.gmail_refresh_token IS 'OAuth2 Refresh Token for Gmail API';
