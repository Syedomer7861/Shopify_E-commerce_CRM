-- Add Gmail OAuth settings to the settings table
ALTER TABLE settings 
  ADD COLUMN IF NOT EXISTS gmail_client_id TEXT,
  ADD COLUMN IF NOT EXISTS gmail_client_secret TEXT,
  ADD COLUMN IF NOT EXISTS gmail_project_id TEXT,
  ADD COLUMN IF NOT EXISTS gmail_auth_uri TEXT DEFAULT 'https://accounts.google.com/o/oauth2/auth',
  ADD COLUMN IF NOT EXISTS gmail_token_uri TEXT DEFAULT 'https://oauth2.googleapis.com/token',
  ADD COLUMN IF NOT EXISTS gmail_auth_provider_x509_cert_url TEXT DEFAULT 'https://www.googleapis.com/oauth2/v1/certs',
  ADD COLUMN IF NOT EXISTS gmail_redirect_uris TEXT[] DEFAULT '{}';

COMMENT ON COLUMN settings.gmail_client_secret IS 'Encrypted Google OAuth Client Secret';
