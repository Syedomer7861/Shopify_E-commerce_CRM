-- Phase 7a (Super Admin): where each workspace request came from.
--
-- The public site records UTM tags and the referring site's host name, only
-- after the visitor allows analytics in the cookie banner. The first and the
-- latest touch are sent with the contact form and stored here. The contact
-- endpoint validates both (src/lib/attribution.ts) and writes with the server
-- key; no browser write path exists, as before. Existing RLS on
-- contact_requests is unchanged.
--
-- Rollback:
--   ALTER TABLE public.contact_requests DROP COLUMN IF EXISTS first_touch, DROP COLUMN IF EXISTS last_touch;
-- Safe to re-run.

BEGIN;

ALTER TABLE public.contact_requests
  ADD COLUMN IF NOT EXISTS first_touch JSONB,
  ADD COLUMN IF NOT EXISTS last_touch  JSONB;

ALTER TABLE public.contact_requests DROP CONSTRAINT IF EXISTS contact_requests_touch_shape;
ALTER TABLE public.contact_requests ADD CONSTRAINT contact_requests_touch_shape CHECK (
  (first_touch IS NULL OR (jsonb_typeof(first_touch) = 'object' AND pg_column_size(first_touch) < 2048)) AND
  (last_touch  IS NULL OR (jsonb_typeof(last_touch)  = 'object' AND pg_column_size(last_touch)  < 2048))
);

COMMIT;
