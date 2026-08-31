-- ============================================================
-- Workspace comment snippets — canned messages inserted in a task comment
-- box by typing "/". Managed by workspace admins (Templates & Snippets
-- modal). Read by any workspace member.
-- Re-runnable.
-- ============================================================

CREATE TABLE IF NOT EXISTS mkt_comment_snippets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(120) NOT NULL,
  body        TEXT NOT NULL,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mkt_comment_snippets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mkt_comment_snippets_read" ON mkt_comment_snippets;
CREATE POLICY "mkt_comment_snippets_read" ON mkt_comment_snippets FOR SELECT TO authenticated
  USING (public.is_marketing_staff());

DROP POLICY IF EXISTS "mkt_comment_snippets_write" ON mkt_comment_snippets;
CREATE POLICY "mkt_comment_snippets_write" ON mkt_comment_snippets FOR ALL TO authenticated
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

INSERT INTO mkt_comment_snippets (title, body)
SELECT * FROM (VALUES
  ('Approved',          'Approved — good to proceed. ✅'),
  ('Needs changes',     'Needs a few changes before this can move forward:' || chr(10) || '- '),
  ('On hold',           'Putting this on hold for now — will revisit once priorities are clearer.'),
  ('Ready for review',  'Ready for review. Please take a look when you get a chance.'),
  ('Blocked',           'Blocked — waiting on: ')
) AS v(title, body)
WHERE NOT EXISTS (SELECT 1 FROM mkt_comment_snippets);
