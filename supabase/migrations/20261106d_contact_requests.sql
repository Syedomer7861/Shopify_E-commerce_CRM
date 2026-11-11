-- Self-serve signup is being retired (workspaces are now provisioned by the
-- platform team and handed over with credentials) - this is the landing
-- page's new "Contact Us" destination. Public/anon never gets a write
-- policy here; the only writer is /api/contact, which uses the service-role
-- key (same pattern as /api/signup creating the first org/admin). Reads are
-- platform-admin only, reusing is_platform_admin() from 20261105u.

CREATE TABLE IF NOT EXISTS contact_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  company     VARCHAR(200),
  phone       VARCHAR(50),
  message     TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'provisioned', 'declined')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_status ON contact_requests(status, created_at DESC);

ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_read_contact_requests" ON contact_requests;
CREATE POLICY "platform_admin_read_contact_requests" ON contact_requests FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admin_update_contact_requests" ON contact_requests;
CREATE POLICY "platform_admin_update_contact_requests" ON contact_requests FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- No INSERT policy for anon/authenticated: the public form goes through
-- /api/contact's service-role client, same as /api/signup already does for
-- the (now admin-gated) org/profile creation it performs.
