-- CRITICAL: the settings table's only RLS policy is
--   CREATE POLICY "auth_all" ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- (schema.sql) - it was never tightened the way profiles/tasks/leaves/etc.
-- were in 20260427_rls_hardening.sql. This table holds plaintext API
-- secrets: whatsapp_app_secret, whatsapp_token, shopify_api_secret,
-- shopify_refresh_token, gmail_client_secret, gmail_refresh_token,
-- twilio_auth_token, exotel_token, sms_twilio_token. Any authenticated
-- user - including the lowest-privilege agent - can currently read every
-- one of them with `supabase.from("settings").select("*")` from the
-- browser console. Confirmed this is already happening in normal use:
-- tasks/page.tsx and dashboard/page.tsx both do `.select("*")` on
-- settings client-side (to read 4 WhatsApp message templates for
-- TaskCard), which means the full row - secrets included - already
-- ships to every agent's browser on every page load.
--
-- Fix: lock the base table to admin-only, and add a narrow view exposing
-- only what agent-facing pages actually use (verified by grep - just the
-- WhatsApp template texts and the enabled flag, nothing secret).

DROP POLICY IF EXISTS "auth_all" ON settings;
CREATE POLICY "admin_manage_settings" ON settings
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Deliberately NOT security_invoker: this view must read past the
-- admin-only RLS policy above using its owner's privileges, exposing only
-- the whitelisted columns below to whoever queries the view. That's the
-- whole point - column-level security Postgres RLS can't express directly.
CREATE OR REPLACE VIEW public.settings_public AS
SELECT
  id,
  whatsapp_enabled,
  whatsapp_review_template,
  whatsapp_reorder_template,
  whatsapp_recovery_template,
  whatsapp_final_template,
  whatsapp_admin_phone -- a recipient phone number, not a secret; reports/page.tsx reads it for view_analytics users (managers/HR), not just admins
FROM settings;

GRANT SELECT ON public.settings_public TO authenticated;
