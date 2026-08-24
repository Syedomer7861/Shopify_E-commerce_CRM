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
-- result silently discarded by the calling code - meaning every COD order,
-- every order over Rs 25,000, and every first-time customer coming through
-- either webhook has never gotten its verification/VIP/welcome task
-- created, and the daily win-back cron has never successfully created one.
--
-- The first version of this migration only covered those five plus 'ndr'
-- and failed on ADD CONSTRAINT: production already has a row with a
-- task_type outside even that list. Grepped again and found two more real,
-- active call sites the first pass missed:
--   src/lib/task-engine.ts:310          -> "manager_audit"
--   src/app/(app)/settings/page.tsx:406 -> "automation"
--
-- If this ALTER fails again, the constraint is still missing some value.
-- Run this first to find it - a plain SELECT, so it shows in the Results
-- panel regardless of what happens next, rather than relying on a
-- RAISE WARNING that may or may not surface depending on the SQL editor's
-- log level:
--
--   SELECT task_type, count(*) FROM tasks
--   WHERE task_type NOT IN (
--     'review','reorder','final_followup','recovery','issue_resolution','transit_update',
--     'welcome_call','vip_followup','win_back','cod_verify','ndr',
--     'manager_audit','automation'
--   )
--   GROUP BY task_type;
--
-- Then tell me what it returns and I'll add it here.
-- ============================================================

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check CHECK (task_type IN (
  'review', 'reorder', 'final_followup', 'recovery', 'issue_resolution', 'transit_update',
  'welcome_call', 'vip_followup', 'win_back', 'cod_verify', 'ndr',
  'manager_audit', 'automation'
));
