-- Field team: live location sharing, and proof photos kept in the org's own
-- Google Drive instead of Supabase storage.
--
-- 1. field_live_locations: ONE row per person (upserted), the latest
--    position only, so it never grows. Written only by the person while they
--    have "Share live location" switched on; readable by them and by whoever
--    may already see their visits (same can_reach rule as visits).
-- 2. visits.check_in_photo_drive_id: Drive file id when the photo went to
--    Google Drive. Shown through /api/field/proof, which checks the viewer
--    can see the visit; the file itself stays private in the org's Drive.
-- 3. org_google_connections: two switches (photos to Drive, visit rows to
--    the sheet) and the cached Drive folder id. Still service-role only.
--
-- Additive only. Rollback:
--   DROP TABLE IF EXISTS public.field_live_locations;
--   ALTER TABLE public.visits DROP COLUMN IF EXISTS check_in_photo_drive_id;
--   ALTER TABLE public.org_google_connections DROP COLUMN IF EXISTS field_photos_to_drive,
--     DROP COLUMN IF EXISTS field_visits_to_sheet, DROP COLUMN IF EXISTS field_folder_id;

BEGIN;

CREATE TABLE IF NOT EXISTS public.field_live_locations (
  user_id     uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  lat         numeric(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         numeric(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m  numeric(7,1) CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  sharing     boolean NOT NULL DEFAULT true,
  started_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS field_live_locations_org ON public.field_live_locations (org_id, updated_at DESC);

ALTER TABLE public.field_live_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.field_live_locations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_live_locations TO authenticated;
GRANT ALL ON public.field_live_locations TO service_role;

DROP POLICY IF EXISTS field_live_read ON public.field_live_locations;
CREATE POLICY field_live_read ON public.field_live_locations FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND (user_id = auth.uid() OR public.can_reach('visits', 'view', user_id)));
DROP POLICY IF EXISTS field_live_insert ON public.field_live_locations;
CREATE POLICY field_live_insert ON public.field_live_locations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND org_id = public.current_org_id());
DROP POLICY IF EXISTS field_live_update ON public.field_live_locations;
CREATE POLICY field_live_update ON public.field_live_locations FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND org_id = public.current_org_id());
DROP POLICY IF EXISTS field_live_delete ON public.field_live_locations;
CREATE POLICY field_live_delete ON public.field_live_locations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS check_in_photo_drive_id text CHECK (check_in_photo_drive_id IS NULL OR check_in_photo_drive_id ~ '^[A-Za-z0-9_-]{10,128}$');

ALTER TABLE public.org_google_connections
  ADD COLUMN IF NOT EXISTS field_photos_to_drive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS field_visits_to_sheet boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS field_folder_id text;

COMMIT;
