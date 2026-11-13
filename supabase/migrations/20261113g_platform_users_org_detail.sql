-- Phase 3 (Super Admin): organisation detail, user directory, user controls.
--
-- 1. platform_org_notes: the owner's private tags and notes per organisation.
--    Separate from organizations so org admins (who can read their own
--    organizations row) never see them. Read by the verified owner only;
--    written only through platform_save_org_notes(), which logs the change.
-- 2. platform_user_directory(org): every account across organisations, with
--    sign-in facts from auth (last sign-in, suspended, two-factor on).
-- 3. platform_org_usage(org): record counts for one organisation.
-- 4. platform_set_user_suspended(user, bool): blocks or restores sign-in
--    (auth ban) and ends every session when blocking. Leaves profiles.is_active
--    alone, which stays the org admin's own Team switch.
-- 5. platform_force_sign_out(user): ends every session for one account.
--
-- All gated by is_platform_owner_verified() inside the function, so callers
-- without the owner flag and a two-factor session get nothing or an error.
-- The owner cannot suspend or sign out their own account or another owner.
-- Ended sessions stop refreshing at once; an access token already issued
-- stays valid until it expires (at most one hour).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.platform_force_sign_out(uuid);
--   DROP FUNCTION IF EXISTS public.platform_set_user_suspended(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.platform_assert_user_target(uuid);
--   DROP FUNCTION IF EXISTS public.platform_org_usage(uuid);
--   DROP FUNCTION IF EXISTS public.platform_user_directory(uuid);
--   DROP FUNCTION IF EXISTS public.platform_save_org_notes(uuid, text[], text);
--   DROP TABLE IF EXISTS public.platform_org_notes;
--   Lift any ban this added: UPDATE auth.users SET banned_until = NULL WHERE id = '<user>';
-- Safe to re-run.

BEGIN;

-- 1. Owner notes and tags.
CREATE TABLE IF NOT EXISTS public.platform_org_notes (
  org_id     UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  tags       TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 20),
  notes      TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_fk_platform_org_notes_updated_by ON public.platform_org_notes (updated_by);
ALTER TABLE public.platform_org_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_org_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_org_notes TO authenticated;
GRANT ALL ON public.platform_org_notes TO service_role;
DROP POLICY IF EXISTS "platform_org_notes_owner_read" ON public.platform_org_notes;
CREATE POLICY "platform_org_notes_owner_read" ON public.platform_org_notes FOR SELECT TO authenticated
  USING (public.is_platform_owner_verified());

CREATE OR REPLACE FUNCTION public.platform_save_org_notes(p_org UUID, p_tags TEXT[], p_notes TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  clean_tags TEXT[];
BEGIN
  IF NOT public.is_platform_owner_verified() THEN
    RAISE EXCEPTION 'Owner access with two-factor required' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(DISTINCT t ORDER BY t), '{}') INTO clean_tags
    FROM (SELECT left(lower(btrim(x)), 40) AS t FROM unnest(coalesce(p_tags, '{}')) x) s
   WHERE t <> '';
  INSERT INTO public.platform_org_notes (org_id, tags, notes, updated_at, updated_by)
  VALUES (p_org, clean_tags, coalesce(p_notes, ''), now(), auth.uid())
  ON CONFLICT (org_id) DO UPDATE
    SET tags = EXCLUDED.tags, notes = EXCLUDED.notes, updated_at = now(), updated_by = auth.uid();
  INSERT INTO public.platform_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'organizations.notes', 'organizations', p_org::text, jsonb_build_object('tags', clean_tags));
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_save_org_notes(UUID, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_save_org_notes(UUID, TEXT[], TEXT) TO authenticated;

-- 2. User directory.
-- ponytail: no paging; add limit/offset when accounts reach the thousands.
CREATE OR REPLACE FUNCTION public.platform_user_directory(p_org UUID DEFAULT NULL)
RETURNS TABLE (
  user_id UUID, email TEXT, name TEXT, role TEXT, org_id UUID, org_name TEXT,
  is_active BOOLEAN, is_platform_admin BOOLEAN, suspended BOOLEAN, two_factor BOOLEAN,
  last_seen_at TIMESTAMPTZ, last_sign_in_at TIMESTAMPTZ, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.email::text, p.name::text, p.role::text, p.org_id, o.name::text,
    coalesce(p.is_active, true), coalesce(p.is_platform_admin, false),
    coalesce(u.banned_until > now(), false),
    EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p.id AND f.status = 'verified'),
    p.last_seen_at, u.last_sign_in_at, p.created_at
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.org_id
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE public.is_platform_owner_verified()
    AND (p_org IS NULL OR p.org_id = p_org)
  ORDER BY p.last_seen_at DESC NULLS LAST, p.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.platform_user_directory(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_user_directory(UUID) TO authenticated;

-- 3. Usage counts for one organisation. Tables missing org_id are skipped.
CREATE OR REPLACE FUNCTION public.platform_org_usage(p_org UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t TEXT;
  n BIGINT;
  out JSONB := '{}'::jsonb;
BEGIN
  IF NOT public.is_platform_owner_verified() THEN
    RETURN NULL;
  END IF;
  FOREACH t IN ARRAY ARRAY['customers','orders','leads','deals','tasks','tickets','invoices','vendors'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id') THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', t) INTO n USING p_org;
      out := out || jsonb_build_object(t, n);
    END IF;
  END LOOP;
  RETURN out;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_org_usage(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_org_usage(UUID) TO authenticated;

-- 4 and 5 share this check.
CREATE OR REPLACE FUNCTION public.platform_assert_user_target(p_user UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target_email TEXT;
  target_owner BOOLEAN;
BEGIN
  IF NOT public.is_platform_owner_verified() THEN
    RAISE EXCEPTION 'Owner access with two-factor required' USING ERRCODE = '42501';
  END IF;
  IF p_user = auth.uid() THEN
    RAISE EXCEPTION 'You cannot do this to your own account' USING ERRCODE = '42501';
  END IF;
  SELECT p.email, coalesce(p.is_platform_admin, false) INTO target_email, target_owner
    FROM public.profiles p WHERE p.id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_owner THEN
    RAISE EXCEPTION 'Owner accounts cannot be changed here' USING ERRCODE = '42501';
  END IF;
  RETURN target_email;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_assert_user_target(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_user_suspended(p_user UUID, p_suspend BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target_email TEXT := public.platform_assert_user_target(p_user);
  ended INT := 0;
BEGIN
  -- A far-future date, not 'infinity': the auth server reads this column as a normal timestamp.
  UPDATE auth.users SET banned_until = CASE WHEN p_suspend THEN now() + interval '100 years' END
   WHERE id = p_user;
  IF p_suspend THEN
    DELETE FROM auth.sessions WHERE user_id = p_user;
    GET DIAGNOSTICS ended = ROW_COUNT;
  END IF;
  INSERT INTO public.platform_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), CASE WHEN p_suspend THEN 'users.suspend' ELSE 'users.reactivate' END,
          'profiles', p_user::text, jsonb_build_object('email', target_email, 'sessions_ended', ended));
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_set_user_suspended(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_user_suspended(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_force_sign_out(p_user UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target_email TEXT := public.platform_assert_user_target(p_user);
  ended INT;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = p_user;
  GET DIAGNOSTICS ended = ROW_COUNT;
  INSERT INTO public.platform_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'users.force_sign_out', 'profiles', p_user::text,
          jsonb_build_object('email', target_email, 'sessions_ended', ended));
  RETURN ended;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_force_sign_out(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_force_sign_out(UUID) TO authenticated;

COMMIT;
