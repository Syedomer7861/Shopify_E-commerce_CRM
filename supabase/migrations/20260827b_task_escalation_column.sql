-- Tracks whether a task has already triggered an SLA escalation
-- notification, so /api/cron/sla-escalator (see that route) never
-- re-notifies the same task on every daily run once it's been flagged.
alter table tasks add column if not exists escalated_at timestamptz;
