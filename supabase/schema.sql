-- ============================================================
-- CureForever CRM — Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor to create all tables
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── customers ──────────────────────────────────────────────
CREATE TABLE customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id VARCHAR(50)  UNIQUE,
  name                VARCHAR(255) NOT NULL,
  phone               VARCHAR(20)  NOT NULL UNIQUE,  -- E.164: +91XXXXXXXXXX
  email               VARCHAR(255),
  alt_phone           VARCHAR(20),
  address             TEXT,
  city                VARCHAR(100),
  state               VARCHAR(100),
  zip                 VARCHAR(20),
  country             VARCHAR(100),
  custom_meta         JSONB        NOT NULL DEFAULT '{}',
  whatsapp_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  last_wa_inbound_at   TIMESTAMPTZ,
  segment             VARCHAR(20)  NOT NULL DEFAULT 'one_time'
                      CHECK (segment IN ('repeat','one_time','inactive','risky')),
  rto_flag            BOOLEAN      NOT NULL DEFAULT false,
  rto_count           INTEGER      NOT NULL DEFAULT 0,
  total_orders        INTEGER      NOT NULL DEFAULT 0,
  last_order_date     TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── orders ─────────────────────────────────────────────────
CREATE TABLE orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         UUID         NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  shopify_order_id    VARCHAR(50)  UNIQUE,
  order_number        VARCHAR(50),
  line_items          JSONB        NOT NULL DEFAULT '[]',
  total_price         DECIMAL(10,2),
  fulfillment_status  VARCHAR(30)  NOT NULL DEFAULT 'unfulfilled'
                      CHECK (fulfillment_status IN ('unfulfilled','partial','fulfilled')),
  tracking_number     VARCHAR(100),
  delivery_status     VARCHAR(30)  NOT NULL DEFAULT 'pending'
                      CHECK (delivery_status IN ('pending','in_transit','out_for_delivery','delivered','rto','failed')),
  ordered_at          TIMESTAMPTZ  NOT NULL,
  delivered_at        TIMESTAMPTZ,
  source              VARCHAR(20)  NOT NULL DEFAULT 'shopify'
                      CHECK (source IN ('shopify','shiprocket','excel','manual')),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── tasks ──────────────────────────────────────────────────
CREATE TABLE tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID         REFERENCES orders(id) ON DELETE CASCADE,
  abandoned_cart_id UUID,
  customer_id       UUID         NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  assigned_to       UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  task_type         VARCHAR(30)  NOT NULL
                    CHECK (task_type IN ('review','reorder','final_followup','recovery','issue_resolution','transit_update')),
  due_date          DATE         NOT NULL,
  call_attempt_count INTEGER      NOT NULL DEFAULT 0,
  next_attempt_at   TIMESTAMPTZ,
  priority_score    INTEGER      NOT NULL DEFAULT 0,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','due','done','rescheduled','skipped','cancelled','overdue')),
  completed_at      TIMESTAMPTZ,
  rescheduled_to    DATE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── call_logs ──────────────────────────────────────────────
CREATE TABLE call_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID         NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  customer_id  UUID         NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  outcome      VARCHAR(30)  NOT NULL
               CHECK (outcome IN ('done','rescheduled','no_answer','skipped','whatsapp')),
  disposition  VARCHAR(30)
               CHECK (disposition IN ('interested','callback_requested','purchased','support_needed','not_interested','wrong_number','follow_up_later')),
  follow_up_action VARCHAR(100),
  note         TEXT,
  called_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  agent_name   VARCHAR(100)
);

CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_email  VARCHAR(255),
  entity_type  VARCHAR(50) NOT NULL,
  entity_id    VARCHAR(100),
  action       VARCHAR(50) NOT NULL,
  summary      TEXT NOT NULL,
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── settings (single row, use upsert) ──────────────────────
CREATE TABLE settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_offset_days      INTEGER   NOT NULL DEFAULT 5,
  reorder_offset_days     INTEGER   NOT NULL DEFAULT 20,
  final_offset_days       INTEGER   NOT NULL DEFAULT 30,
  inactive_threshold_days INTEGER   NOT NULL DEFAULT 45,
  whatsapp_enabled        BOOLEAN   NOT NULL DEFAULT false,
  whatsapp_phone_id       VARCHAR(100),
  whatsapp_token          TEXT,          -- store encrypted
  shopify_store_domain    VARCHAR(255),
  shopify_client_id       VARCHAR(255),
  shopify_api_key         TEXT,          -- store encrypted
  shopify_api_secret      TEXT,          -- store encrypted
  shopify_token_expires_at TIMESTAMPTZ,
  shopify_webhook_secret  TEXT,          -- store encrypted
  shiprocket_email        VARCHAR(255),
  shiprocket_password     TEXT,          -- store encrypted
  shiprocket_webhook_secret TEXT,
  whatsapp_bridge_url     TEXT         DEFAULT 'http://localhost:3001',
  whatsapp_admin_phone    TEXT,
  whatsapp_review_template TEXT DEFAULT 'Hi {{name}} 👋, thank you for ordering {{product}}! How was your experience? We''d love to hear your feedback. 🌿',
  whatsapp_reorder_template TEXT DEFAULT 'Hi {{name}}! It''s been a while since your last {{product}} order. Time for a refill? 💊 Use code REFILL10 for 10% off!',
  whatsapp_recovery_template TEXT DEFAULT 'Hi {{name}} 👋, we noticed you left some items in your cart! 🛒 Can we help you complete your purchase? Use code RECOVER5 for 5% off! 🌿',
  whatsapp_final_template TEXT DEFAULT 'Hi {{name}}, just checking in one last time regarding your {{product}} journey. We''re here if you need anything! 🙏',
  recovery_delay_hours    INTEGER      DEFAULT 24,
  whatsapp_send_time      TIME         DEFAULT '10:00:00',
  gmail_client_id         TEXT,
  gmail_client_secret     TEXT,
  gmail_project_id        TEXT,
  gmail_auth_uri          TEXT         DEFAULT 'https://accounts.google.com/o/oauth2/auth',
  gmail_token_uri         TEXT         DEFAULT 'https://oauth2.googleapis.com/token',
  gmail_auth_provider_x509_cert_url TEXT DEFAULT 'https://www.googleapis.com/oauth2/v1/certs',
  gmail_redirect_uris     TEXT[]       DEFAULT '{}',
  gmail_refresh_token     TEXT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── product_overrides ──────────────────────────────────────
CREATE TABLE product_overrides (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_product_id  VARCHAR(50)  NOT NULL UNIQUE,
  product_name        VARCHAR(255) NOT NULL,
  course_duration_days INTEGER      DEFAULT 30,
  review_offset_days  INTEGER,       -- NULL = use global default
  reorder_offset_days INTEGER,
  final_offset_days   INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── webhook_logs (for debugging) ───────────────────────────
CREATE TABLE webhook_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source     VARCHAR(20) NOT NULL CHECK (source IN ('shopify','shiprocket')),
  topic      VARCHAR(100),
  payload    JSONB,
  status     VARCHAR(20) NOT NULL DEFAULT 'received'
             CHECK (status IN ('received','processed','failed','skipped')),
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── indexes ────────────────────────────────────────────────
CREATE INDEX idx_tasks_customer_status_due ON tasks (customer_id, status, due_date);
CREATE INDEX idx_tasks_order_type          ON tasks (order_id, task_type);
CREATE INDEX idx_tasks_due_date_status     ON tasks (due_date, status);
CREATE INDEX idx_orders_customer_delivery  ON orders (customer_id, delivery_status);
CREATE INDEX idx_orders_shopify_id         ON orders (shopify_order_id);
CREATE INDEX idx_orders_delivery_status    ON orders (delivery_status);
CREATE INDEX idx_customers_phone           ON customers (phone);
CREATE INDEX idx_customers_segment         ON customers (segment);
CREATE INDEX idx_call_logs_customer        ON call_logs (customer_id);
CREATE INDEX idx_call_logs_task            ON call_logs (task_id);
CREATE INDEX idx_audit_logs_entity         ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_created_at     ON audit_logs (created_at DESC);

-- ── updated_at triggers ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER orders_updated_at    BEFORE UPDATE ON orders    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER settings_updated_at  BEFORE UPDATE ON settings  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
 
-- ── abandoned_carts ────────────────────────────────────────
CREATE TABLE abandoned_carts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
  phone           VARCHAR(20)  NOT NULL,
  email           VARCHAR(255),
  cart_token      VARCHAR(100) UNIQUE NOT NULL,
  total_price     DECIMAL(10,2) NOT NULL DEFAULT 0,
  line_items      JSONB        NOT NULL DEFAULT '[]',
  recovery_status VARCHAR(20)  NOT NULL DEFAULT 'pending'
                  CHECK (recovery_status IN ('pending','recovered','cancelled')),
  abandoned_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE tasks
  ADD CONSTRAINT tasks_abandoned_cart_id_fkey
  FOREIGN KEY (abandoned_cart_id) REFERENCES abandoned_carts(id) ON DELETE CASCADE;

CREATE TRIGGER abandoned_carts_updated_at BEFORE UPDATE ON abandoned_carts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
 
-- ── Row Level Security ─────────────────────────────────────
ALTER TABLE customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_carts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read/write all rows
-- (single-agent v1 — tighten per user in multi-agent v2)
CREATE POLICY "auth_all" ON customers        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON orders           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON abandoned_carts  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON tasks            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON call_logs        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON settings         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON product_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON audit_logs       FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Webhook logs: service role only (webhooks don't have JWT)
CREATE POLICY "service_all" ON webhook_logs  FOR ALL TO service_role USING (true);

-- ── Initial settings row ───────────────────────────────────
INSERT INTO settings (id, review_offset_days, reorder_offset_days, final_offset_days, inactive_threshold_days)
VALUES ('00000000-0000-0000-0000-000000000000', 5, 20, 30, 45)
ON CONFLICT DO NOTHING;

-- ── Useful views ───────────────────────────────────────────

-- Today's due tasks with full context (Orders + Abandoned Carts)
CREATE OR REPLACE VIEW v_today_tasks AS
SELECT
  t.id, t.task_type, t.due_date, t.status,
  c.id AS customer_id, c.name AS customer_name, c.phone, c.segment, c.rto_flag,
  o.id AS order_id, o.order_number, o.line_items AS order_items, o.total_price AS order_price,
  o.delivery_status, o.delivered_at, o.tracking_number,
  a.id AS abandoned_cart_id, a.cart_token AS abandoned_token, a.total_price AS abandoned_price, a.line_items AS abandoned_items
FROM tasks t
JOIN customers c ON c.id = t.customer_id
LEFT JOIN orders o ON o.id = t.order_id
LEFT JOIN abandoned_carts a ON a.id = t.abandoned_cart_id
WHERE t.due_date = CURRENT_DATE AND t.status IN ('pending','due');

-- Overdue tasks
CREATE OR REPLACE VIEW v_overdue_tasks AS
SELECT
  t.id, t.task_type, t.due_date, t.status,
  c.id AS customer_id, c.name AS customer_name, c.phone, c.segment,
  o.id AS order_id, o.order_number, o.line_items AS order_items, o.delivered_at,
  a.id AS abandoned_cart_id, a.cart_token AS abandoned_token, a.total_price AS abandoned_price,
  CURRENT_DATE - t.due_date AS days_overdue
FROM tasks t
JOIN customers c ON c.id = t.customer_id
LEFT JOIN orders o ON o.id = t.order_id
LEFT JOIN abandoned_carts a ON a.id = t.abandoned_cart_id
WHERE t.due_date < CURRENT_DATE AND t.status NOT IN ('done','skipped','cancelled')
ORDER BY t.due_date ASC;

-- Customer segment summary
CREATE OR REPLACE VIEW v_segment_summary AS
SELECT
  segment,
  COUNT(*) AS count,
  AVG(total_orders)::NUMERIC(5,1) AS avg_orders,
  COUNT(*) FILTER (WHERE rto_flag) AS rto_flagged
FROM customers
GROUP BY segment;
-- ── profiles (Admin vs Agent) ──────────────────────────────
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      VARCHAR(255),
  name       VARCHAR(255),
  role       VARCHAR(20) NOT NULL DEFAULT 'agent' CHECK (role IN ('admin','agent')),
  permissions JSONB NOT NULL DEFAULT '{"view_analytics": false, "can_import": false, "can_delete": false, "manage_team": false}'::jsonb,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to avoid recursion in policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Anyone logged in can read profiles
CREATE POLICY "profiles_read_all" ON profiles FOR SELECT TO authenticated USING (true);

-- Policy: Only admins can manage others (add/update/delete)
CREATE POLICY "profiles_admin_manage" ON profiles 
FOR ALL TO authenticated 
USING (public.is_admin());

-- Trigger: create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (new.id, new.email, '', 'agent');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
