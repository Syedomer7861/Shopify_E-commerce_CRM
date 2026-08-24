-- ============================================================
-- agent_activity_logs.activity_type: drop the CHECK constraint.
--
-- The logs show:
--   new row for relation "agent_activity_logs" violates check constraint
--   "agent_activity_logs_activity_type_check"    (23514 / HTTP 400)
--
-- The constraint allows four values:
--     'call', 'whatsapp', 'task_completion', 'login'
--
-- The application writes at least nine named ones —
--     attendance_update, email_sent, manual_sync, task_completed,
--     task_completion, task_rescheduled, task_skipped, whatsapp, whatsapp_sent
-- — and src/lib/audit.ts forwards an arbitrary `action` string, so the set is
-- open-ended by design.
--
-- Enumerating event names in a database constraint is the wrong shape for an
-- activity log: every new feature would need a migration, and the failure mode
-- is losing the audit record rather than rejecting bad data. VARCHAR(50)
-- already bounds the value. Widening the enum would only postpone this.
--
-- Safe to re-run.
-- ============================================================

ALTER TABLE agent_activity_logs
  DROP CONSTRAINT IF EXISTS agent_activity_logs_activity_type_check;

-- Queries and views filter on specific values ('call', 'whatsapp', ...), so
-- keep that lookup cheap now that the column accepts a wider set.
CREATE INDEX IF NOT EXISTS idx_agent_activity_logs_type
  ON agent_activity_logs (activity_type);

-- Confirm: expect zero rows.
SELECT conname AS remaining_check
FROM pg_constraint
WHERE conrelid = 'agent_activity_logs'::regclass
  AND conname = 'agent_activity_logs_activity_type_check';
