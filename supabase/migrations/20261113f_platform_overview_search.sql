-- Phase 2 (Super Admin): real platform numbers and owner search.
--
-- All three functions return nothing unless the caller is the platform
-- owner with a two-factor session (is_platform_owner_verified). They read
-- across organisations, so they are functions rather than wider row rules:
-- no table's row security changes.
--
-- Activity comes from profiles.last_seen_at, which the app's heartbeat
-- updates while someone has the app open. "Active in last N days" = seen
-- within that window.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.platform_overview();
--   DROP FUNCTION IF EXISTS public.platform_org_directory();
--   DROP FUNCTION IF EXISTS public.platform_search(text);
-- Safe to re-run.
BEGIN;

CREATE OR REPLACE FUNCTION public.platform_overview()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN NOT public.is_platform_owner_verified() THEN NULL ELSE jsonb_build_object(
    'orgs_total',      (SELECT count(*) FROM organizations),
    'orgs_active',     (SELECT count(*) FROM organizations WHERE is_active),
    'orgs_suspended',  (SELECT count(*) FROM organizations WHERE NOT is_active),
    'orgs_new_30d',    (SELECT count(*) FROM organizations WHERE created_at > now() - interval '30 days'),
    'users_total',     (SELECT count(*) FROM profiles),
    'users_enabled',   (SELECT count(*) FROM profiles WHERE is_active IS NOT FALSE),
    'users_new_30d',   (SELECT count(*) FROM profiles WHERE created_at > now() - interval '30 days'),
    'active_1d',       (SELECT count(*) FROM profiles WHERE last_seen_at > now() - interval '1 day'),
    'active_7d',       (SELECT count(*) FROM profiles WHERE last_seen_at > now() - interval '7 days'),
    'active_30d',      (SELECT count(*) FROM profiles WHERE last_seen_at > now() - interval '30 days'),
    'requests_new',    (SELECT count(*) FROM contact_requests WHERE status = 'new'),
    'requests_total',  (SELECT count(*) FROM contact_requests),
    'storage_bytes',   (SELECT coalesce(sum((metadata->>'size')::bigint), 0) FROM storage.objects),
    'generated_at',    now()
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.platform_org_directory()
RETURNS TABLE (
  org_id UUID, name VARCHAR, slug VARCHAR, plan VARCHAR, is_active BOOLEAN,
  created_at TIMESTAMPTZ, member_count BIGINT, active_7d BIGINT,
  last_seen_at TIMESTAMPTZ, disabled_modules TEXT[], admin_email TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.id, o.name, o.slug, o.plan, o.is_active, o.created_at,
    (SELECT count(*) FROM profiles p WHERE p.org_id = o.id),
    (SELECT count(*) FROM profiles p WHERE p.org_id = o.id AND p.last_seen_at > now() - interval '7 days'),
    (SELECT max(p.last_seen_at) FROM profiles p WHERE p.org_id = o.id),
    o.disabled_modules::text[],
    (SELECT p.email FROM profiles p WHERE p.org_id = o.id AND p.role = 'admin' ORDER BY p.created_at LIMIT 1)::text
  FROM organizations o
  WHERE public.is_platform_owner_verified()
  ORDER BY o.created_at;
$$;

CREATE OR REPLACE FUNCTION public.platform_search(q TEXT)
RETURNS TABLE (kind TEXT, id TEXT, title TEXT, subtitle TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH term AS (SELECT '%' || btrim(coalesce(q, '')) || '%' AS t, length(btrim(coalesce(q, ''))) AS n)
  (SELECT 'organisation', o.id::text, o.name::text, (o.slug || CASE WHEN o.is_active THEN '' ELSE ' · suspended' END)::text
     FROM organizations o, term
    WHERE public.is_platform_owner_verified() AND term.n >= 2
      AND (o.name ILIKE term.t OR o.slug ILIKE term.t)
    LIMIT 10)
  UNION ALL
  (SELECT 'user', p.id::text, coalesce(p.name, p.email)::text,
          (p.email || ' · ' || coalesce(o.name, 'no organisation') || ' · ' || coalesce(p.role, ''))::text
     FROM profiles p LEFT JOIN organizations o ON o.id = p.org_id, term
    WHERE public.is_platform_owner_verified() AND term.n >= 2
      AND (p.name ILIKE term.t OR p.email ILIKE term.t)
    LIMIT 15)
  UNION ALL
  (SELECT 'request', c.id::text, c.name::text, (c.email || coalesce(' · ' || c.company, '') || ' · ' || c.status)::text
     FROM contact_requests c, term
    WHERE public.is_platform_owner_verified() AND term.n >= 2
      AND (c.name ILIKE term.t OR c.email ILIKE term.t OR c.company ILIKE term.t)
    LIMIT 10);
$$;

REVOKE EXECUTE ON FUNCTION public.platform_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_org_directory() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_search(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_org_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_search(TEXT) TO authenticated;

COMMIT;
