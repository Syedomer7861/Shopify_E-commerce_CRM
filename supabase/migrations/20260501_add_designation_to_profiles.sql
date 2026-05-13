-- Add designation column to profiles for custom job titles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS designation VARCHAR(100);

-- Update existing profiles to have a default designation based on their role
UPDATE profiles SET designation = role WHERE designation IS NULL;
