-- Real product catalog pulled from Shopify, so upsell suggestions can pick
-- from what CureForever actually sells at its actual current price instead
-- of a hand-typed, quickly-stale UPSELL_RULES table (src/lib/upsell-engine.ts).
CREATE TABLE IF NOT EXISTS product_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_product_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(10,2),
  description TEXT,
  tags TEXT[],
  product_type TEXT,
  handle TEXT,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_active ON product_catalog(active) WHERE active = true;

ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;

-- Read-only catalog data (no prices/PII risk) - every authenticated caller
-- (agents, the upsell AI route) can read it; only service-role/cron writes.
CREATE POLICY agent_read_product_catalog ON product_catalog
  FOR SELECT TO authenticated USING (true);
