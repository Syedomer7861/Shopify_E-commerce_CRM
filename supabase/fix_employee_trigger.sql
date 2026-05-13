-- =====================================================================
-- FIX: Employee Creation "Database error creating new user"
-- Run this in Supabase SQL Editor > New Query > Run
-- =====================================================================

-- Step 1: Fix the handle_new_user trigger function
-- Uses ON CONFLICT DO NOTHING so it doesn't crash if profile already exists
-- Also reads name from user_metadata passed during createUser()
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', ''),
    CASE 
      WHEN new.raw_user_meta_data->>'role' IN ('admin', 'agent', 'manager', 'hr')
      THEN new.raw_user_meta_data->>'role'
      ELSE 'agent'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Expand the role CHECK constraint to include manager, hr
-- (removes old constraint and adds new one with all supported roles)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'agent', 'manager', 'hr'));

-- Step 3: Verify the fix
SELECT 'Trigger function updated successfully' AS status;
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
  AND contype = 'c';
