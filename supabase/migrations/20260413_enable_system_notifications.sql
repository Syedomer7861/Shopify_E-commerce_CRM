-- ============================================================
-- CureForever CRM — Enable Realtime Notifications for Admins
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Ensure the supabase_realtime publication exists (Supabase creates this by default)
-- Add the required tables so notifications are broadcasted to the frontend listeners

ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
