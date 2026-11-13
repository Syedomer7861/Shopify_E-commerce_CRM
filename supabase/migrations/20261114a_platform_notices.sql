-- Phase 9a (Super Admin): in-app notices from the platform owner to customer
-- workspaces (maintenance windows, new features, billing reminders).
--
-- The owner writes a notice with an optional time window and audience
-- (all workspaces, chosen plans and/or chosen organisations). Members of a
-- matching workspace see it as a banner at the top of the app until it
-- ends or they dismiss it (dismissal is per browser; nothing is stored).
--
-- Members never read the table directly: my_platform_notices() returns only
-- the live notices aimed at the caller's own organisation, and only the
-- fields the banner needs. Owner reads the table; writes go through
-- platform_save_notice (owner + two-factor, audited).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.my_platform_notices();
--   DROP FUNCTION IF EXISTS public.platform_save_notice(uuid, text, text, text, timestamptz, timestamptz, text[], uuid[], boolean);
--   DROP TABLE IF EXISTS public.platform_notices;
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_notices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  body           TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  level          TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning')),
  starts_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at        TIMESTAMPTZ CHECK (ends_at IS NULL OR ends_at > starts_at),
  audience_plans TEXT[] CHECK (audience_plans IS NULL OR cardinality(audience_plans) BETWEEN 1 AND 50),
  audience_orgs  UUID[] CHECK (audience_orgs IS NULL OR cardinality(audience_orgs) BETWEEN 1 AND 500),
  is_archived    BOOLEAN NOT NULL DEFAULT false,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fk_platform_notices_created_by ON public.platform_notices (created_by);
CREATE INDEX IF NOT EXISTS idx_platform_notices_live ON public.platform_notices (starts_at) WHERE NOT is_archived;

ALTER TABLE public.platform_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_notices TO authenticated;
GRANT ALL ON public.platform_notices TO service_role;
DROP POLICY IF EXISTS "platform_owner_read" ON public.platform_notices;
CREATE POLICY "platform_owner_read" ON public.platform_notices FOR SELECT TO authenticated USING (public.is_platform_owner_verified());

-- p_id NULL creates; otherwise updates. Empty arrays mean "everyone".
CREATE OR REPLACE FUNCTION public.platform_save_notice(
  p_id UUID, p_title TEXT, p_body TEXT, p_level TEXT, p_starts_at TIMESTAMPTZ, p_ends_at TIMESTAMPTZ,
  p_plans TEXT[], p_orgs UUID[], p_archived BOOLEAN)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id UUID := p_id;
  v_plans TEXT[] := CASE WHEN cardinality(p_plans) > 0 THEN p_plans END;
  v_orgs UUID[] := CASE WHEN cardinality(p_orgs) > 0 THEN p_orgs END;
BEGIN
  PERFORM public.platform_require_owner();
  IF v_id IS NULL THEN
    INSERT INTO public.platform_notices (title, body, level, starts_at, ends_at, audience_plans, audience_orgs, is_archived, created_by)
    VALUES (btrim(p_title), coalesce(p_body, ''), coalesce(p_level, 'info'), coalesce(p_starts_at, now()), p_ends_at,
            v_plans, v_orgs, coalesce(p_archived, false), auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.platform_audit('notice.create', 'platform_notice', v_id::text, jsonb_build_object('title', btrim(p_title)));
  ELSE
    UPDATE public.platform_notices SET title = btrim(p_title), body = coalesce(p_body, ''), level = coalesce(p_level, 'info'),
      starts_at = coalesce(p_starts_at, starts_at), ends_at = p_ends_at, audience_plans = v_plans, audience_orgs = v_orgs,
      is_archived = coalesce(p_archived, is_archived), updated_at = now()
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Notice not found' USING ERRCODE = 'P0002'; END IF;
    PERFORM public.platform_audit('notice.update', 'platform_notice', v_id::text,
      jsonb_build_object('title', btrim(p_title), 'archived', p_archived));
  END IF;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_save_notice(uuid, text, text, text, timestamptz, timestamptz, text[], uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_save_notice(uuid, text, text, text, timestamptz, timestamptz, text[], uuid[], boolean) TO authenticated;

-- Live notices for the caller's own organisation only.
CREATE OR REPLACE FUNCTION public.my_platform_notices()
RETURNS TABLE (id uuid, title text, body text, level text, starts_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT n.id, n.title, n.body, n.level, n.starts_at
  FROM public.profiles p
  JOIN public.organizations o ON o.id = p.org_id
  JOIN public.platform_notices n ON NOT n.is_archived
   AND n.starts_at <= now() AND (n.ends_at IS NULL OR n.ends_at > now())
   AND (n.audience_orgs IS NULL OR o.id = ANY (n.audience_orgs))
   AND (n.audience_plans IS NULL OR o.plan = ANY (n.audience_plans))
  WHERE p.id = auth.uid()
  ORDER BY n.starts_at DESC
  LIMIT 5;
$$;
REVOKE EXECUTE ON FUNCTION public.my_platform_notices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_platform_notices() TO authenticated;

COMMIT;
