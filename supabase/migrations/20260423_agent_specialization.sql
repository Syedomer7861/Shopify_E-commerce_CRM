
-- Migration: Agent Specialization (Segments & Task Types)
-- Added: 2026-04-23

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_segments TEXT[] DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_task_types TEXT[] DEFAULT NULL;

COMMENT ON COLUMN profiles.assigned_segments IS 'Array of customer segments this agent is specialized in. Null means all.';
COMMENT ON COLUMN profiles.assigned_task_types IS 'Array of task types this agent is specialized in. Null means all.';
