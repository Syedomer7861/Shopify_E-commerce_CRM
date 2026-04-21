-- Add advanced product override columns
ALTER TABLE product_overrides ADD COLUMN IF NOT EXISTS course_duration_days INTEGER DEFAULT 30;
ALTER TABLE product_overrides ADD COLUMN IF NOT EXISTS usage_notes TEXT;
ALTER TABLE product_overrides ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT FALSE;
ALTER TABLE product_overrides ADD COLUMN IF NOT EXISTS upsell_product_name TEXT;

-- Update existing records with defaults if needed
UPDATE product_overrides SET course_duration_days = 30 WHERE course_duration_days IS NULL;
UPDATE product_overrides SET is_priority = FALSE WHERE is_priority IS NULL;
