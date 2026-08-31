-- ============================================================
-- Marketing workspace — attachments storage bucket + policies.
--
-- Depends on 20260829c (mkt_attachments table, is_marketing_staff()).
-- Private bucket; files are served via short-lived signed URLs from the API.
-- Re-runnable.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('mkt-attachments', 'mkt-attachments', false, 10485760) -- 10 MB
ON CONFLICT (id) DO NOTHING;

-- storage.objects RLS — scoped to this bucket, gated on marketing staff.
DROP POLICY IF EXISTS "mkt_attach_read" ON storage.objects;
CREATE POLICY "mkt_attach_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'mkt-attachments' AND public.is_marketing_staff());

DROP POLICY IF EXISTS "mkt_attach_write" ON storage.objects;
CREATE POLICY "mkt_attach_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mkt-attachments' AND public.is_marketing_staff());

DROP POLICY IF EXISTS "mkt_attach_delete" ON storage.objects;
CREATE POLICY "mkt_attach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'mkt-attachments' AND public.is_marketing_staff());
