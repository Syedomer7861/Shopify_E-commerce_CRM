-- Quote share links: a quote can be opened by anyone holding its random token
-- (/q/<token>), so it can be sent on WhatsApp or email without a login.
--
-- The token is written by a signed-in user under the existing quotes_edit
-- policy. Anonymous visitors never touch the table: they call
-- get_shared_quote(token), which returns only customer-facing fields (no
-- owner, no deal, no internal ids) for that one quote. Clearing the token
-- revokes the link.
--
-- Additive only. Rollback:
--   DROP FUNCTION IF EXISTS public.get_shared_quote(text);
--   ALTER TABLE public.quotes DROP COLUMN IF EXISTS share_token, DROP COLUMN IF EXISTS shared_at;

BEGIN;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS share_token TEXT CHECK (share_token IS NULL OR share_token ~ '^[A-Za-z0-9_-]{24,64}$'),
  ADD COLUMN IF NOT EXISTS shared_at   TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_share_token ON public.quotes (share_token) WHERE share_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_shared_quote(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE q public.quotes%ROWTYPE; o public.organizations%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{24,64}$' THEN RETURN NULL; END IF;
  SELECT * INTO q FROM public.quotes WHERE share_token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO o FROM public.organizations WHERE id = q.org_id;
  RETURN jsonb_build_object(
    'quote', jsonb_build_object(
      'number', q.number, 'customer_name', q.customer_name, 'customer_gstin', q.customer_gstin,
      'customer_address', q.customer_address, 'issue_date', q.issue_date, 'valid_until', q.valid_until,
      'status', q.status, 'notes', q.notes, 'terms', q.terms, 'currency', q.currency,
      'subtotal', q.subtotal, 'tax_total', q.tax_total, 'total', q.total),
    'lines', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'description', l.description, 'hsn', l.hsn, 'qty', l.qty, 'unit_price', l.unit_price,
        'discount_pct', l.discount_pct, 'tax_rate', l.tax_rate, 'line_total', l.line_total) ORDER BY l.sort_order)
      FROM public.quote_lines l WHERE l.quote_id = q.id), '[]'::jsonb),
    'org_name', o.name,
    'seller', coalesce(o.billing_details, '{}'::jsonb) - 'quote_terms');
END $$;

REVOKE ALL ON FUNCTION public.get_shared_quote(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_quote(text) TO anon, authenticated;

COMMIT;
