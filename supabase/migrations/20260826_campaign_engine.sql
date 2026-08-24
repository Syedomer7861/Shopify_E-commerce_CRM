-- Campaigns previously kept recipient lists and send settings in a local
-- JSON file (src/data/campaign-settings.json). On Vercel that file doesn't
-- survive across invocations/instances, and it also meant real customer
-- names/phone numbers were being committed to git. Moving both into
-- Postgres so campaign state is durable and the send loop can resume
-- across cron ticks instead of dying mid-run inside one request.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS min_delay INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS max_delay INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS send_window_start VARCHAR(5) NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS send_window_end VARCHAR(5) NOT NULL DEFAULT '21:00';

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  name        TEXT NOT NULL DEFAULT 'Unknown Customer',
  phone       TEXT NOT NULL DEFAULT '',
  status      VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  error       TEXT,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status
  ON campaign_recipients (campaign_id, status);

ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON campaign_recipients;
CREATE POLICY "auth_all" ON campaign_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);
