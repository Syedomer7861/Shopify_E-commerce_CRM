-- SECURITY: new logins no longer choose their own organisation or role.
--
-- handle_new_user() used to read org_id and role from raw_user_meta_data,
-- which the user controls (supabase.auth.signUp({ options: { data } }) with
-- the public anon key, and public sign-ups are on). Anyone could create an
-- account as an admin of any organisation whose id they knew, or, with no
-- org_id, land in the default organisation as an agent.
--
-- Now:
--   * raw_app_meta_data (settable only with the service key: team invites,
--     HR, self-serve signup, owner provisioning) decides org and role;
--   * anyone else (public email sign-up, Google sign-in with a new email)
--     gets a brand-new organisation of their own, as its admin, ON HOLD
--     until it pays (billing_hold locks it out via current_org_id()).
--     They never see anyone else's data.
--
-- The app code that sets app_metadata ships BEFORE this migration is applied.
--
-- Rollback: re-create the previous function body (it read
--   raw_user_meta_data->>'org_id' / ->>'role' with default_org_id() fallback).
-- Safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org  UUID;
  v_role TEXT;
  v_name TEXT := left(btrim(coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', '')), 120);
  v_org_name TEXT;
  v_base TEXT;
  v_slug TEXT;
  i INT := 1;
BEGIN
  IF new.raw_app_meta_data ? 'org_id' THEN
    v_org := (new.raw_app_meta_data->>'org_id')::uuid;
    v_role := CASE WHEN new.raw_app_meta_data->>'role' IN ('admin','agent','manager','hr','marketing')
                   THEN new.raw_app_meta_data->>'role' ELSE 'agent' END;
  ELSE
    -- Untrusted sign-up: its own new workspace, held until payment.
    v_org_name := coalesce(nullif(v_name, '') || '''s workspace', split_part(coalesce(new.email, 'new'), '@', 1) || '''s workspace');
    v_base := coalesce(nullif(btrim(regexp_replace(lower(v_org_name), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'org');
    v_base := left(v_base, 70);
    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
      i := i + 1;
      v_slug := v_base || '-' || i;
      IF i > 50 THEN v_slug := v_base || '-' || substr(md5(new.id::text), 1, 8); EXIT; END IF;
    END LOOP;
    INSERT INTO public.organizations (name, slug, billing_hold, billing_state)
    VALUES (left(v_org_name, 120), v_slug, true, 'pending')
    RETURNING id INTO v_org;
    v_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, email, name, role, org_id)
  VALUES (new.id, new.email, v_name, v_role, v_org)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;
