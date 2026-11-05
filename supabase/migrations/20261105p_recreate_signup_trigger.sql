-- The on_auth_user_created trigger (created in Phase 0's
-- 20261105_tenancy_foundation.sql, confirmed successful at the time) is
-- gone from pg_trigger entirely — not disabled, not renamed, just absent.
-- Root cause unconfirmed (possibly a Supabase platform-level auth-schema
-- operation), but the practical fix is the same either way: recreate it.
--
-- Without it, auth.users gets a row on signup but profiles never does —
-- not a security leak (RLS still has nothing to match, so the new user
-- sees nothing), but it leaves every new signup stuck with no role and no
-- permissions. Confirmed missing via the Phase 6a signup test.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, org_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', ''),
    CASE
      WHEN new.raw_user_meta_data->>'role' IN ('admin', 'agent', 'manager', 'hr', 'marketing')
      THEN new.raw_user_meta_data->>'role'
      ELSE 'agent'
    END,
    COALESCE(
      (new.raw_user_meta_data->>'org_id')::uuid,
      public.default_org_id()
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill the Phase 6a test user, which signed up while the trigger was
-- missing and so never got a profiles row.
INSERT INTO public.profiles (id, email, name, role, org_id)
SELECT u.id, u.email,
  COALESCE(u.raw_user_meta_data->>'name', ''),
  COALESCE(u.raw_user_meta_data->>'role', 'agent'),
  (u.raw_user_meta_data->>'org_id')::uuid
FROM auth.users u
WHERE u.email = 'test-phase6-signup@example.com'
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);
