-- Phase 6a (Super Admin): versioned public-site content.
--
-- One row per content key (for example 'home.hero'). The owner edits a draft,
-- then publishes it: the published value gets the next version number and a
-- permanent copy goes to platform_content_versions. Rolling back republishes
-- an old version as a new one, so history is never rewritten.
--
-- Which keys exist and what shape each value has is defined in code
-- (src/lib/site-content.ts), which also holds the fallback text. The public
-- site reads published values on the server with the service key and
-- validates them; anything missing or malformed falls back to the code text,
-- so a bad entry cannot break a page.
--
-- Readable by the verified owner only. Drafts never reach the public site.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.platform_rollback_content(text, int);
--   DROP FUNCTION IF EXISTS public.platform_publish_content(text);
--   DROP FUNCTION IF EXISTS public.platform_save_content_draft(text, jsonb);
--   DROP TABLE IF EXISTS platform_content_versions, platform_content;
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_content (
  key          TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9][a-z0-9_.-]{1,59}$'),
  draft        JSONB,
  published    JSONB,
  version      INT NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK (pg_column_size(draft) < 65536 AND pg_column_size(published) < 65536)
);
CREATE INDEX IF NOT EXISTS idx_fk_platform_content_updated_by ON public.platform_content (updated_by);

CREATE TABLE IF NOT EXISTS public.platform_content_versions (
  key          TEXT NOT NULL REFERENCES public.platform_content(key) ON DELETE CASCADE,
  version      INT NOT NULL,
  value        JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (key, version)
);
CREATE INDEX IF NOT EXISTS idx_fk_platform_content_versions_published_by ON public.platform_content_versions (published_by);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_content','platform_content_versions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "platform_owner_read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "platform_owner_read" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_owner_verified())', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.platform_save_content_draft(p_key TEXT, p_value JSONB)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_require_owner();
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'object' THEN
    RAISE EXCEPTION 'Content must be an object';
  END IF;
  INSERT INTO public.platform_content (key, draft, updated_at, updated_by)
  VALUES (p_key, p_value, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE SET draft = EXCLUDED.draft, updated_at = now(), updated_by = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.platform_publish_content(p_key TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cur public.platform_content;
  next_version INT;
BEGIN
  PERFORM public.platform_require_owner();
  SELECT * INTO cur FROM public.platform_content WHERE key = p_key FOR UPDATE;
  IF NOT FOUND OR cur.draft IS NULL THEN RAISE EXCEPTION 'Nothing to publish'; END IF;
  next_version := cur.version + 1;
  UPDATE public.platform_content
     SET published = cur.draft, draft = NULL, version = next_version, published_at = now(), updated_at = now(), updated_by = auth.uid()
   WHERE key = p_key;
  INSERT INTO public.platform_content_versions (key, version, value, published_by) VALUES (p_key, next_version, cur.draft, auth.uid());
  PERFORM public.platform_audit('content.publish', 'platform_content', p_key, jsonb_build_object('version', next_version));
  RETURN next_version;
END $$;

-- Republish an earlier version as the next version.
CREATE OR REPLACE FUNCTION public.platform_rollback_content(p_key TEXT, p_version INT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old JSONB;
  next_version INT;
BEGIN
  PERFORM public.platform_require_owner();
  SELECT value INTO v_old FROM public.platform_content_versions WHERE key = p_key AND version = p_version;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Version not found' USING ERRCODE = 'P0002'; END IF;
  SELECT version + 1 INTO next_version FROM public.platform_content WHERE key = p_key FOR UPDATE;
  UPDATE public.platform_content
     SET published = v_old, draft = NULL, version = next_version, published_at = now(), updated_at = now(), updated_by = auth.uid()
   WHERE key = p_key;
  INSERT INTO public.platform_content_versions (key, version, value, published_by) VALUES (p_key, next_version, v_old, auth.uid());
  PERFORM public.platform_audit('content.rollback', 'platform_content', p_key, jsonb_build_object('from_version', p_version, 'version', next_version));
  RETURN next_version;
END $$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['platform_save_content_draft(text, jsonb)', 'platform_publish_content(text)', 'platform_rollback_content(text, int)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

COMMIT;
