-- ============================================================
-- tasks.task_type CHECK constraint only allowed six values:
--   review, reorder, final_followup, recovery, issue_resolution, transit_update
--
-- But the app's own domain model has never agreed with that. task-engine.ts
-- defines priority weights for five more types (vip_followup, cod_verify,
-- welcome_call, win_back, ndr), and four real production code paths
-- actively try to create tasks with them:
--
--   src/app/api/cron/task-generator/route.ts   -> "win_back"      (daily cron)
--   src/app/api/webhooks/shiprocket/route.ts   -> "cod_verify", "vip_followup", "welcome_call"
--   src/app/api/webhooks/shopify/route.ts      -> "cod_verify"
--
-- Every one of those inserts has been rejected by this constraint and the
-- result silently discarded by the calling code (see the follow-up commit
-- that adds logging there) - meaning every COD order, every order over
-- Rs 25,000, and every first-time customer coming through either webhook
-- has never gotten its verification/VIP/welcome task created, and the daily
-- win-back cron has never successfully created one either. Silent since
-- whichever migration or commit first shipped these features.
--
-- ndr has no insert site anywhere in the codebase (only referenced in mock
-- data), but is real for read paths: analytics/revenue, manager/stats and
-- sync/shiprocket all query task_type = 'ndr' as if it already exists.
-- Allowed here for consistency with those; NDR task *creation* is a
-- separate, still-open gap - nothing in this migration adds it.
-- ============================================================

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check CHECK (task_type IN (
  'review', 'reorder', 'final_followup', 'recovery', 'issue_resolution', 'transit_update',
  'welcome_call', 'vip_followup', 'win_back', 'cod_verify', 'ndr'
));
