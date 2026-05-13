-- Add author_name column to announcements table
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS author_name VARCHAR(255);
