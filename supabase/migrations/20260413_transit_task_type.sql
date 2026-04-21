-- ============================================================
-- CureForever CRM — Add Transit Update Task Type
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop the old constraint
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;

-- Add the new constraint with 'transit_update' included
ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check CHECK (task_type IN ('review','reorder','final_followup','recovery','issue_resolution','transit_update'));
