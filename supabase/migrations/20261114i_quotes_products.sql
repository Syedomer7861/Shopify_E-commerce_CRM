-- Quotes with products and GST, convertible to invoices.
--
-- products       workspace price list (name, SKU, HSN/SAC, price, GST rate).
--                Readable by members; written by people who can edit deals.
-- quotes         one per offer, optionally linked to a deal. Governed by the
--                Deals permissions (can_reach('deals', ...)) on owner_id.
-- quote_lines    line items; totals are computed by the database (trigger),
--                never trusted from the browser.
-- organizations.billing_details  seller name, GSTIN, address, shown on
--                printed quotes; set by workspace admins via a function.
-- quote_to_invoice() runs as the caller, so invoice permissions and row
--                security still decide whether the invoice can be created.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.quote_to_invoice(uuid), public.set_org_billing_details(jsonb),
--     public.quote_recompute(uuid), public.quote_lines_after(), public.quote_lines_before(), public.quotes_before();
--   DROP TABLE IF EXISTS public.quote_lines, public.quotes, public.products;
--   ALTER TABLE public.organizations DROP COLUMN IF EXISTS billing_details;
--   ALTER TABLE public.invoices DROP COLUMN IF EXISTS tax_total, DROP COLUMN IF EXISTS quote_id;
-- Safe to re-run.

BEGIN;

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS billing_details JSONB NOT NULL DEFAULT '{}'
  CHECK (jsonb_typeof(billing_details) = 'object' AND pg_column_size(billing_details) < 4096);

CREATE OR REPLACE FUNCTION public.set_org_billing_details(p_details JSONB)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o UUID := public.current_org_id();
BEGIN
  IF o IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Only workspace admins can change billing details' USING ERRCODE = '42501'; END IF;
  UPDATE public.organizations SET billing_details = jsonb_strip_nulls(jsonb_build_object(
    'legal_name', left(nullif(btrim(p_details->>'legal_name'), ''), 160),
    'gstin',      upper(left(nullif(btrim(p_details->>'gstin'), ''), 15)),
    'address',    left(nullif(btrim(p_details->>'address'), ''), 500),
    'email',      left(nullif(btrim(p_details->>'email'), ''), 160),
    'phone',      left(nullif(btrim(p_details->>'phone'), ''), 40),
    'quote_terms',left(nullif(btrim(p_details->>'quote_terms'), ''), 2000)))
  WHERE id = o;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_org_billing_details(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_org_billing_details(jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS public.products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  sku         TEXT CHECK (char_length(sku) <= 60),
  hsn         TEXT CHECK (char_length(hsn) <= 12),
  unit_price  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_rate    NUMERIC(5,2) NOT NULL DEFAULT 18 CHECK (tax_rate BETWEEN 0 AND 100),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.products FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
DROP POLICY IF EXISTS products_read ON public.products;
CREATE POLICY products_read ON public.products FOR SELECT TO authenticated USING (org_id = public.current_org_id());
DROP POLICY IF EXISTS products_write ON public.products;
CREATE POLICY products_write ON public.products FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('deals', 'edit')))
  WITH CHECK (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('deals', 'edit')));

CREATE TABLE IF NOT EXISTS public.quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  number         TEXT NOT NULL,
  deal_id        UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  customer_name  TEXT NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 160),
  customer_email TEXT CHECK (char_length(customer_email) <= 160),
  customer_gstin TEXT CHECK (char_length(customer_gstin) <= 15),
  customer_address TEXT CHECK (char_length(customer_address) <= 500),
  issue_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until    DATE,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','invoiced')),
  notes          TEXT CHECK (char_length(notes) <= 2000),
  terms          TEXT CHECK (char_length(terms) <= 2000),
  currency       CHAR(3) NOT NULL DEFAULT 'INR',
  subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  invoice_id     UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  owner_id       UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
CREATE INDEX IF NOT EXISTS quotes_org_created ON public.quotes (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_deal ON public.quotes (deal_id);

CREATE TABLE IF NOT EXISTS public.quote_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id     UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description  TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 300),
  hsn          TEXT CHECK (char_length(hsn) <= 12),
  qty          NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  tax_rate     NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  line_total   NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order   INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS quote_lines_quote ON public.quote_lines (quote_id, sort_order);

-- Numbering (Q-000001 per workspace) and locking: an invoiced quote is final.
CREATE OR REPLACE FUNCTION public.quotes_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM public.organizations WHERE id = NEW.org_id FOR UPDATE;
    NEW.number := 'Q-' || lpad((coalesce((SELECT max(substring(number FROM 3)::int) FROM public.quotes
                                           WHERE org_id = NEW.org_id AND number ~ '^Q-\d+$'), 0) + 1)::text, 6, '0');
    NEW.subtotal := 0; NEW.tax_total := 0; NEW.total := 0; NEW.invoice_id := NULL;
    IF NEW.status = 'invoiced' THEN NEW.status := 'draft'; END IF;
  ELSE
    IF OLD.status = 'invoiced' AND current_setting('app.quote_invoicing', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'This quote has been invoiced and can no longer change' USING ERRCODE = '23514';
    END IF;
    NEW.number := OLD.number; NEW.org_id := OLD.org_id;
    IF current_setting('app.quote_totals', true) IS DISTINCT FROM 'on' THEN
      NEW.subtotal := OLD.subtotal; NEW.tax_total := OLD.tax_total; NEW.total := OLD.total;
    END IF;
    IF current_setting('app.quote_invoicing', true) IS DISTINCT FROM 'on' THEN
      NEW.invoice_id := OLD.invoice_id;
      IF NEW.status = 'invoiced' THEN NEW.status := OLD.status; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_quotes_before ON public.quotes;
CREATE TRIGGER trg_quotes_before BEFORE INSERT OR UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.quotes_before();

CREATE OR REPLACE FUNCTION public.quote_lines_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE q public.quotes%ROWTYPE;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = coalesce(NEW.quote_id, OLD.quote_id);
  IF q.status = 'invoiced' THEN RAISE EXCEPTION 'This quote has been invoiced and can no longer change' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.org_id := q.org_id;
  NEW.line_total := round(NEW.qty * NEW.unit_price * (1 - NEW.discount_pct / 100), 2);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_quote_lines_before ON public.quote_lines;
CREATE TRIGGER trg_quote_lines_before BEFORE INSERT OR UPDATE OR DELETE ON public.quote_lines FOR EACH ROW EXECUTE FUNCTION public.quote_lines_before();

CREATE OR REPLACE FUNCTION public.quote_recompute(p_quote UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('app.quote_totals', 'on', true);
  UPDATE public.quotes q SET
    subtotal  = coalesce((SELECT sum(line_total) FROM public.quote_lines WHERE quote_id = q.id), 0),
    tax_total = coalesce((SELECT sum(round(line_total * tax_rate / 100, 2)) FROM public.quote_lines WHERE quote_id = q.id), 0),
    total     = coalesce((SELECT sum(line_total + round(line_total * tax_rate / 100, 2)) FROM public.quote_lines WHERE quote_id = q.id), 0)
  WHERE q.id = p_quote;
  PERFORM set_config('app.quote_totals', 'off', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.quote_recompute(uuid), public.quotes_before(), public.quote_lines_before() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.quote_lines_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.quote_recompute(coalesce(NEW.quote_id, OLD.quote_id));
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.quote_lines_after() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_quote_lines_after ON public.quote_lines;
CREATE TRIGGER trg_quote_lines_after AFTER INSERT OR UPDATE OR DELETE ON public.quote_lines FOR EACH ROW EXECUTE FUNCTION public.quote_lines_after();

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quotes, public.quote_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes, public.quote_lines TO authenticated;
GRANT ALL ON public.quotes, public.quote_lines TO service_role;

DROP POLICY IF EXISTS quotes_read ON public.quotes;
CREATE POLICY quotes_read ON public.quotes FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.can_reach('deals', 'view', owner_id));
DROP POLICY IF EXISTS quotes_create ON public.quotes;
CREATE POLICY quotes_create ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_perm('deals', 'create') AND owner_id = auth.uid());
DROP POLICY IF EXISTS quotes_edit ON public.quotes;
CREATE POLICY quotes_edit ON public.quotes FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.can_reach('deals', 'edit', owner_id))
  WITH CHECK (org_id = public.current_org_id() AND public.can_reach('deals', 'edit', owner_id));
DROP POLICY IF EXISTS quotes_delete ON public.quotes;
CREATE POLICY quotes_delete ON public.quotes FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND status <> 'invoiced' AND public.can_reach('deals', 'delete', owner_id));

DROP POLICY IF EXISTS quote_lines_read ON public.quote_lines;
CREATE POLICY quote_lines_read ON public.quote_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.org_id = public.current_org_id() AND public.can_reach('deals', 'view', q.owner_id)));
DROP POLICY IF EXISTS quote_lines_write ON public.quote_lines;
CREATE POLICY quote_lines_write ON public.quote_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.org_id = public.current_org_id() AND public.can_reach('deals', 'edit', q.owner_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.org_id = public.current_org_id() AND public.can_reach('deals', 'edit', q.owner_id)));

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_total NUMERIC(14,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL;

-- Runs as the caller: the invoice insert is checked by the invoices policies.
CREATE OR REPLACE FUNCTION public.quote_to_invoice(p_quote UUID)
RETURNS UUID LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  q public.quotes%ROWTYPE;
  inv UUID := gen_random_uuid();
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = p_quote;  -- row security applies
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002'; END IF;
  IF q.status = 'invoiced' THEN RAISE EXCEPTION 'This quote is already invoiced' USING ERRCODE = '23514'; END IF;
  IF q.total <= 0 THEN RAISE EXCEPTION 'Add at least one line before invoicing' USING ERRCODE = '23514'; END IF;
  INSERT INTO public.invoices (id, org_id, number, direction, party_name, amount, tax_total, issue_date, due_date, status, notes, quote_id)
  VALUES (inv, q.org_id, 'INV-' || substring(q.number FROM 3), 'receivable', q.customer_name, q.total, q.tax_total,
          CURRENT_DATE, CURRENT_DATE + 15, 'draft', 'From quote ' || q.number, q.id);
  PERFORM set_config('app.quote_invoicing', 'on', true);
  UPDATE public.quotes SET status = 'invoiced', invoice_id = inv WHERE id = q.id;
  PERFORM set_config('app.quote_invoicing', 'off', true);
  RETURN inv;
END $$;
REVOKE EXECUTE ON FUNCTION public.quote_to_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_to_invoice(uuid) TO authenticated;

COMMIT;
