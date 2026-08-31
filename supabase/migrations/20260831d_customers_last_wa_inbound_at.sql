-- customers.last_wa_inbound_at was in schema.sql and src/types but never
-- reached the live database. Two callers depend on it:
--   - api/webhooks/whatsapp writes it on every inbound message (the write
--     silently no-ops today because supabase-js doesn't throw on a bad column)
--   - api/cron/unresponsive-handler SELECTs it and 500s ("column
--     customers_1.last_wa_inbound_at does not exist")
--
-- Additive, nullable, re-runnable.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_wa_inbound_at TIMESTAMPTZ;
