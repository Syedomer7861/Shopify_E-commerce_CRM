-- Field Visits: proof of presence at check-in.
--
-- A check-in now carries a photo taken with the live camera in the same tap
-- that reads the GPS position. This adds where that photo lives and how
-- accurate the position was.
--
-- Photos sit in a private bucket at  <org_id>/<owner_id>/<visit_id>-<ms>.jpg
--   - a rep can only write into their own folder of their own organisation
--   - reading follows the same permission-engine rule as the visits table
--     (can_reach 'visits' 'view' on the owner), so a manager sees their
--     team's photos and a rep sees their own
--   - there is no UPDATE or DELETE policy: a proof photo cannot be replaced
--     or removed from the app
--
-- Additive. Requires 20261111c (permission engine) and 20261111f (visits).
-- Safe to re-run.
BEGIN;

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS check_in_photo_path  TEXT,
  ADD COLUMN IF NOT EXISTS check_in_accuracy_m  NUMERIC(8, 1);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('visit-proofs', 'visit-proofs', false, 3145728, ARRAY['image/jpeg']) -- 3 MB
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "visit_proofs_insert" ON storage.objects;
CREATE POLICY "visit_proofs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'visit-proofs'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "visit_proofs_read" ON storage.objects;
CREATE POLICY "visit_proofs_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'visit-proofs'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    AND public.can_reach('visits', 'view', ((storage.foldername(name))[2])::uuid)
  );

COMMIT;
