-- Phase 6 follow-up: schema foundation for real multi-tenant integrations.
-- Purely additive — nothing here drops or changes an existing constraint,
-- so today's single tenant (CureForever) keeps working unchanged while
-- the app code (next migration/commit) switches to the new composite
-- keys. Four separate problems, each confirmed by reading the actual
-- code that depends on them:
--
-- 1. settings_public (20260826d) is a security_invoker=false view that
--    deliberately reads past the admin-only RLS on `settings` to expose a
--    few WhatsApp template columns to every authenticated user. It has NO
--    org filter at all. Harmless today (one global row), but the moment a
--    2nd org fills in its own settings row, EVERY user of EVERY org would
--    see every other org's WhatsApp templates and admin phone number
--    through this view. Fixed by adding the org filter the view was always
--    missing.
--
-- 2. settings itself needs to go from "one global row" to "one row per
--    org" - a UNIQUE(org_id) constraint plus a seed trigger (mirroring
--    20261105n's seed_default_roles pattern) so every new org gets a
--    blank settings row to fill in via its own Settings page, instead of
--    silently sharing CureForever's.
--
-- 3/4. customers.phone, orders.shopify_order_id, abandoned_carts.cart_token,
--    product_catalog/product_overrides.shopify_product_id, and
--    push_subscriptions.endpoint are each enforced UNIQUE globally (app
--    code's onConflict targets prove it - e.g. onConflict: "phone"
--    wouldn't work against anything else). Phone numbers, Shopify order
--    numbers, and cart tokens are NOT globally unique across two
--    different Shopify stores - two tenants WILL eventually collide on
--    all three, and today's constraints would make the second tenant's
--    webhook silently upsert into the first tenant's row. Adding the
--    org-scoped composite index now (additive, doesn't touch the old
--    global one) lets the app code switch its onConflict targets safely.
--    The OLD global unique constraints are deliberately NOT dropped here
--    - they're harmless to leave in place (CureForever is still the only
--    tenant, so "globally unique" and "unique within this org" mean the
--    same thing today) and dropping them is only actually necessary once
--    a 2nd org needs to reuse a phone/order-number/cart-token that
--    CureForever already has. Tracked as deliberate follow-up, not
--    skipped - see the memory note for this session.

-- ------------------------------------------------------------
-- 1. settings_public: add the org filter it never had.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.settings_public AS
SELECT
  id,
  whatsapp_enabled,
  whatsapp_review_template,
  whatsapp_reorder_template,
  whatsapp_recovery_template,
  whatsapp_final_template,
  whatsapp_admin_phone
FROM settings
WHERE org_id = public.current_org_id();

-- ------------------------------------------------------------
-- 2. settings: one row per org + seed trigger.
-- ------------------------------------------------------------
ALTER TABLE settings ADD CONSTRAINT settings_org_id_unique UNIQUE (org_id);

CREATE OR REPLACE FUNCTION public.seed_default_settings(target_org_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO settings (org_id)
  VALUES (target_org_id)
  ON CONFLICT (org_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_seed_default_settings_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.seed_default_settings(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_settings ON organizations;
CREATE TRIGGER trg_seed_default_settings
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_default_settings_fn();

-- ------------------------------------------------------------
-- 3. Org-scoped composite unique indexes (additive, old ones untouched).
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS customers_org_phone_unique ON customers(org_id, phone);
CREATE UNIQUE INDEX IF NOT EXISTS orders_org_shopify_order_id_unique ON orders(org_id, shopify_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS abandoned_carts_org_cart_token_unique ON abandoned_carts(org_id, cart_token);
CREATE UNIQUE INDEX IF NOT EXISTS product_catalog_org_shopify_product_id_unique ON product_catalog(org_id, shopify_product_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_overrides_org_shopify_product_id_unique ON product_overrides(org_id, shopify_product_id);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_org_endpoint_unique ON push_subscriptions(org_id, endpoint);
