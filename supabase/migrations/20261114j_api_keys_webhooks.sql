-- Public API keys and outgoing webhooks.
--
-- api_keys: a workspace admin creates a key; the plain key is returned once
--   by create_api_key() and only its SHA-256 hash is stored. The API server
--   (service key) resolves a key with api_key_lookup(), which refuses
--   revoked keys and suspended or unpaid workspaces. Every API query is then
--   filtered to that workspace explicitly, and limited to the key's scopes.
-- webhook_endpoints: admins register https URLs for events. Triggers on
--   leads, deals, tickets, quotes and invoices post a signed JSON payload
--   with pg_net (asynchronous, from the database), so every path that
--   creates records fires them. A webhook problem never blocks the write.
--   Signature: header X-CodeCrest-Signature = hex HMAC-SHA256(body, secret).
--
-- Rollback:
--   DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY['leads','deals','tickets','quotes','invoices'] LOOP
--     EXECUTE format('DROP TRIGGER IF EXISTS trg_webhook_events ON public.%I', t); END LOOP; END $$;
--   DROP FUNCTION IF EXISTS public.webhook_events(), public.webhook_fire(uuid, text, jsonb), public.webhook_recent(),
--     public.create_api_key(text, text[]), public.api_key_lookup(text), public.create_webhook(text, text[]), public.webhook_url_ok(text);
--   DROP TABLE IF EXISTS public.webhook_deliveries, public.webhook_endpoints, public.api_keys;
--   (pg_net stays installed; DROP EXTENSION pg_net only if nothing else uses it.)
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pg_net;

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  prefix       TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  scopes       TEXT[] NOT NULL CHECK (scopes <@ ARRAY['leads:read','leads:write','deals:read','deals:write','tickets:read']::text[] AND cardinality(scopes) >= 1),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, org_id, name, prefix, scopes, created_by, created_at, last_used_at, revoked_at) ON public.api_keys TO authenticated;
GRANT UPDATE (revoked_at) ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
DROP POLICY IF EXISTS ak_read ON public.api_keys;
CREATE POLICY ak_read ON public.api_keys FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND public.is_admin());
DROP POLICY IF EXISTS ak_revoke ON public.api_keys;
CREATE POLICY ak_revoke ON public.api_keys FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.is_admin()) WITH CHECK (org_id = public.current_org_id() AND public.is_admin());

CREATE OR REPLACE FUNCTION public.create_api_key(p_name TEXT, p_scopes TEXT[])
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  o UUID := public.current_org_id();
  k TEXT := 'cc_' || encode(gen_random_bytes(24), 'hex');
BEGIN
  IF o IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Only workspace admins can create API keys' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM public.api_keys WHERE org_id = o AND revoked_at IS NULL) >= 20 THEN
    RAISE EXCEPTION 'A workspace can have up to 20 active keys' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.api_keys (org_id, name, prefix, key_hash, scopes, created_by)
  VALUES (o, btrim(p_name), left(k, 10), encode(digest(k, 'sha256'), 'hex'), (SELECT array_agg(DISTINCT s) FROM unnest(p_scopes) s), auth.uid());
  RETURN k;  -- shown once, never stored
END $$;

CREATE OR REPLACE FUNCTION public.api_key_lookup(p_key TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE r RECORD;
BEGIN
  SELECT k.id, k.org_id, k.scopes INTO r
    FROM public.api_keys k JOIN public.organizations o ON o.id = k.org_id
   WHERE k.key_hash = encode(digest(p_key, 'sha256'), 'hex') AND k.revoked_at IS NULL
     AND o.is_active AND NOT coalesce(o.billing_hold, false);
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.api_keys SET last_used_at = now() WHERE id = r.id AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute');
  RETURN jsonb_build_object('key_id', r.id, 'org_id', r.org_id, 'scopes', to_jsonb(r.scopes));
END $$;

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url         TEXT NOT NULL CHECK (char_length(url) <= 500),
  events      TEXT[] NOT NULL CHECK (cardinality(events) >= 1 AND events <@ ARRAY['lead.created','deal.created','deal.won','ticket.created','quote.accepted','invoice.created']::text[]),
  secret      TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id          BIGSERIAL PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event       TEXT NOT NULL,
  request_id  BIGINT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_org ON public.webhook_deliveries (org_id, created_at DESC);
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webhook_endpoints, public.webhook_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, org_id, url, events, is_active, created_at), UPDATE (is_active, events), DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints, public.webhook_deliveries TO service_role;
DROP POLICY IF EXISTS we_admin ON public.webhook_endpoints;
CREATE POLICY we_admin ON public.webhook_endpoints FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_admin()) WITH CHECK (org_id = public.current_org_id() AND public.is_admin());

-- https only, and never a private, loopback or link-local address.
CREATE OR REPLACE FUNCTION public.webhook_url_ok(p_url TEXT)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_url ~* '^https://[a-z0-9.-]+(:[0-9]{2,5})?(/[^\s]*)?$'
     AND substring(p_url FROM '^https://([^/:]+)') !~* '^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.|\[)'
$$;

CREATE OR REPLACE FUNCTION public.create_webhook(p_url TEXT, p_events TEXT[])
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  o UUID := public.current_org_id();
  s TEXT := 'whsec_' || encode(gen_random_bytes(24), 'hex');
BEGIN
  IF o IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Only workspace admins can add webhooks' USING ERRCODE = '42501'; END IF;
  IF NOT public.webhook_url_ok(btrim(p_url)) THEN RAISE EXCEPTION 'Use a public https:// address' USING ERRCODE = '23514'; END IF;
  IF (SELECT count(*) FROM public.webhook_endpoints WHERE org_id = o) >= 10 THEN RAISE EXCEPTION 'Up to 10 webhooks per workspace' USING ERRCODE = '23514'; END IF;
  INSERT INTO public.webhook_endpoints (org_id, url, events, secret) VALUES (o, btrim(p_url), (SELECT array_agg(DISTINCT e) FROM unnest(p_events) e), s);
  RETURN s;  -- shown once so the receiver can verify signatures
END $$;

CREATE OR REPLACE FUNCTION public.webhook_fire(p_org UUID, p_event TEXT, p_data JSONB)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  e public.webhook_endpoints%ROWTYPE;
  body TEXT;
  rid BIGINT;
BEGIN
  FOR e IN SELECT * FROM public.webhook_endpoints WHERE org_id = p_org AND is_active AND p_event = ANY (events) LOOP
    BEGIN
      body := jsonb_build_object('event', p_event, 'occurred_at', now(), 'data', p_data)::text;
      SELECT net.http_post(
        url := e.url, body := body::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'User-Agent', 'CodeCrest-Webhooks',
                     'X-CodeCrest-Event', p_event, 'X-CodeCrest-Signature', encode(hmac(body, e.secret, 'sha256'), 'hex')),
        timeout_milliseconds := 5000) INTO rid;
      INSERT INTO public.webhook_deliveries (org_id, endpoint_id, event, request_id) VALUES (p_org, e.id, p_event, rid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.webhook_deliveries (org_id, endpoint_id, event, error) VALUES (p_org, e.id, p_event, left(SQLERRM, 300));
    END;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.webhook_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ev TEXT;
BEGIN
  ev := CASE
    WHEN TG_TABLE_NAME = 'leads' AND TG_OP = 'INSERT' THEN 'lead.created'
    WHEN TG_TABLE_NAME = 'deals' AND TG_OP = 'INSERT' THEN 'deal.created'
    WHEN TG_TABLE_NAME = 'deals' AND TG_OP = 'UPDATE' AND NEW.status = 'won' AND OLD.status IS DISTINCT FROM 'won' THEN 'deal.won'
    WHEN TG_TABLE_NAME = 'tickets' AND TG_OP = 'INSERT' THEN 'ticket.created'
    WHEN TG_TABLE_NAME = 'quotes' AND TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN 'quote.accepted'
    WHEN TG_TABLE_NAME = 'invoices' AND TG_OP = 'INSERT' THEN 'invoice.created'
  END;
  IF ev IS NOT NULL AND EXISTS (SELECT 1 FROM public.webhook_endpoints WHERE org_id = NEW.org_id AND is_active AND ev = ANY (events)) THEN
    BEGIN
      PERFORM public.webhook_fire(NEW.org_id, ev, to_jsonb(NEW));
    EXCEPTION WHEN OTHERS THEN NULL;  -- a webhook must never block the write
    END;
  END IF;
  RETURN NULL;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','deals','tickets','quotes','invoices'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_webhook_events ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_webhook_events AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.webhook_events()', t);
  END LOOP;
END $$;

-- Last 50 deliveries with the receiver's HTTP status, for the admin screen.
CREATE OR REPLACE FUNCTION public.webhook_recent()
RETURNS TABLE (id BIGINT, endpoint_id UUID, event TEXT, created_at TIMESTAMPTZ, status_code INT, error TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN; END IF;
  RETURN QUERY
    SELECT d.id, d.endpoint_id, d.event, d.created_at, r.status_code, coalesce(d.error, r.error_msg)
      FROM public.webhook_deliveries d LEFT JOIN net._http_response r ON r.id = d.request_id
     WHERE d.org_id = public.current_org_id()
     ORDER BY d.created_at DESC LIMIT 50;
END $$;

REVOKE EXECUTE ON FUNCTION public.webhook_fire(uuid, text, jsonb), public.webhook_events(), public.api_key_lookup(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_key_lookup(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_api_key(text, text[]), public.create_webhook(text, text[]), public.webhook_recent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_api_key(text, text[]), public.create_webhook(text, text[]), public.webhook_recent() TO authenticated;

COMMIT;
