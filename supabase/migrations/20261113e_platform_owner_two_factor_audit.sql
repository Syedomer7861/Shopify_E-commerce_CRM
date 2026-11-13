-- Phase 1b (Super Admin): owner actions need two-factor and leave a trail.
--
-- 1. is_platform_owner_verified(): the owner flag AND a session that passed
--    two-factor (JWT claim aal = 'aal2'). Every platform-wide rule and the
--    cross-org stats function now use it, so a stolen password alone no
--    longer opens other organisations. The owner's own organisation keeps
--    working as before (those rules use current_org_id(), not this).
-- 2. platform_audit_logs: append-only record of owner actions. Readable only
--    by the verified owner; written by database triggers and the server key.
--    No update or delete for anyone in the app.
-- 3. Owner changes to organisations and contact requests are logged
--    automatically, with each changed field's old and new value.
-- 4. my_org_is_active(): lets a member of a suspended organisation learn
--    only that one fact, so the app can show a clear message.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_log_platform_change ON organizations;
--   DROP TRIGGER IF EXISTS trg_log_platform_change ON contact_requests;
--   DROP FUNCTION IF EXISTS public.log_platform_change();
--   DROP FUNCTION IF EXISTS public.my_org_is_active();
--   Recreate the three policies and platform_admin_org_stats with
--   is_platform_admin() in place of is_platform_owner_verified() (see 20261105u, 20261106d).
--   DROP TABLE platform_audit_logs;  -- only if the history is not wanted
-- Safe to re-run.
BEGIN;

-- 1. Verified owner.
CREATE OR REPLACE FUNCTION public.is_platform_owner_verified()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_platform_admin() AND coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_owner_verified() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_owner_verified() TO authenticated, service_role;

DROP POLICY IF EXISTS "platform_admin_manage_orgs" ON organizations;
CREATE POLICY "platform_admin_manage_orgs" ON organizations FOR ALL TO authenticated
  USING (public.is_platform_owner_verified())
  WITH CHECK (public.is_platform_owner_verified());

DROP POLICY IF EXISTS "platform_admin_read_contact_requests" ON contact_requests;
CREATE POLICY "platform_admin_read_contact_requests" ON contact_requests FOR SELECT TO authenticated
  USING (public.is_platform_owner_verified());

DROP POLICY IF EXISTS "platform_admin_update_contact_requests" ON contact_requests;
CREATE POLICY "platform_admin_update_contact_requests" ON contact_requests FOR UPDATE TO authenticated
  USING (public.is_platform_owner_verified())
  WITH CHECK (public.is_platform_owner_verified());

CREATE OR REPLACE FUNCTION public.platform_admin_org_stats()
RETURNS TABLE (
  org_id UUID, name VARCHAR, slug VARCHAR, plan VARCHAR,
  is_active BOOLEAN, member_count BIGINT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.id, o.name, o.slug, o.plan, o.is_active,
    (SELECT count(*) FROM public.profiles p WHERE p.org_id = o.id),
    o.created_at
  FROM public.organizations o
  WHERE public.is_platform_owner_verified()
  ORDER BY o.created_at;
$$;
REVOKE EXECUTE ON FUNCTION public.platform_admin_org_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_admin_org_stats() TO authenticated;

-- 2. Owner audit trail.
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID,            -- no foreign key: the record outlives the account
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_created ON platform_audit_logs (created_at DESC);
ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON platform_audit_logs TO authenticated;
GRANT ALL ON platform_audit_logs TO service_role;

DROP POLICY IF EXISTS "platform_audit_owner_read" ON platform_audit_logs;
CREATE POLICY "platform_audit_owner_read" ON platform_audit_logs FOR SELECT TO authenticated
  USING (public.is_platform_owner_verified());

-- 3. Log owner edits.
CREATE OR REPLACE FUNCTION public.log_platform_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  diff JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RETURN NEW;
  END IF;
  SELECT jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
    INTO diff
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
   WHERE n.value IS DISTINCT FROM o.value AND n.key <> 'updated_at';
  IF diff IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.platform_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), TG_TABLE_NAME || '.update', TG_TABLE_NAME, NEW.id::text, jsonb_build_object('changed', diff));
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_platform_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_platform_change ON organizations;
CREATE TRIGGER trg_log_platform_change AFTER UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.log_platform_change();
DROP TRIGGER IF EXISTS trg_log_platform_change ON contact_requests;
CREATE TRIGGER trg_log_platform_change AFTER UPDATE ON contact_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_platform_change();

-- 4. Suspended organisation check (own organisation only, one boolean).
CREATE OR REPLACE FUNCTION public.my_org_is_active()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.is_active FROM public.profiles p
  JOIN public.organizations o ON o.id = p.org_id
  WHERE p.id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.my_org_is_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_org_is_active() TO authenticated;

COMMIT;
