-- Profile photo + date of birth; personal details locked to admin/HR.
--
-- 1. profiles.date_of_birth (set by admin/HR, shown read-only to the person).
-- 2. profiles.avatar_path: the person's own photo in the private `avatars`
--    bucket at <org_id>/<user_id>/<file>. The app shows it via signed URLs.
-- 3. Trigger: a regular member updating their own row (profiles_self_update)
--    can no longer change name, email, phone, date of birth, joining date,
--    salary, designation, department, location or emergency contact. Admins,
--    HR and service-role connections are unaffected. The status / last_seen /
--    live_state writes the app makes for the person keep working.
--    avatar_path may only point inside the person's own folder.
-- 4. `avatars` bucket (private, 1 MB, images only). Members of an org can read
--    photos in their org's folder; each person writes only their own folder.
--
-- No existing data changes. Safe to re-run.
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_protect_profile_personal_details ON profiles;
--   DROP FUNCTION IF EXISTS public.protect_profile_personal_details();
--   DROP POLICY IF EXISTS avatars_read ON storage.objects;
--   DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
--   DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
--   DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
--   (columns and bucket can stay; they are unused without the app.)
BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_path text;

CREATE OR REPLACE FUNCTION public.protect_profile_personal_details()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  k text;
  n jsonb := to_jsonb(NEW);
  o jsonb := to_jsonb(OLD);
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() OR public.has_role('hr') THEN
    RETURN NEW;
  END IF;

  -- Keys missing from the table compare as null = null, so this list is safe
  -- even where a column does not exist.
  FOREACH k IN ARRAY ARRAY['name','email','phone','date_of_birth','joining_date',
    'monthly_salary','salary','designation','department','location','city','state',
    'country','emergency_contact','org_id']
  LOOP
    IF (n -> k) IS DISTINCT FROM (o -> k) THEN
      RAISE EXCEPTION 'Only admins or HR can change %.', replace(k, '_', ' ');
    END IF;
  END LOOP;

  IF NEW.avatar_path IS DISTINCT FROM OLD.avatar_path AND NEW.avatar_path IS NOT NULL
     AND NEW.avatar_path NOT LIKE (OLD.org_id::text || '/' || auth.uid()::text || '/%') THEN
    RAISE EXCEPTION 'Profile photo must be in your own folder.';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_profile_personal_details() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_profile_personal_details ON profiles;
CREATE TRIGGER trg_protect_profile_personal_details
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_personal_details();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 1048576, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS avatars_read ON storage.objects;
CREATE POLICY avatars_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = public.current_org_id()::text);

DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND (storage.foldername(name))[2] = auth.uid()::text);

DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND (storage.foldername(name))[2] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND (storage.foldername(name))[2] = auth.uid()::text);

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND (storage.foldername(name))[2] = auth.uid()::text);

COMMIT;
