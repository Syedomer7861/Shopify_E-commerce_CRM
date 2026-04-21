-- Add Shopify OAuth refresh columns to settings table
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS shopify_api_secret TEXT,
ADD COLUMN IF NOT EXISTS shopify_refresh_token TEXT;

COMMENT ON COLUMN settings.shopify_api_secret IS 'The Shopify App Client Secret used for token refresh.';
COMMENT ON COLUMN settings.shopify_refresh_token IS 'The Shopify OAuth Refresh Token used to obtain new access tokens.';
