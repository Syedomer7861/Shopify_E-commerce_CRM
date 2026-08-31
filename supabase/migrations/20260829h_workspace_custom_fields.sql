-- ============================================================
-- Workspace — per-list custom fields.
--
-- Field DEFINITIONS live on the list; field VALUES live on each task
-- (mkt_tasks.custom_fields jsonb already exists, keyed by field id).
--
--   mkt_lists.custom_fields : [
--     { "id": "budget", "name": "Budget", "type": "money" },
--     { "id": "platform", "name": "Platform", "type": "select",
--       "options": ["Meta", "Google", "TikTok"] }
--   ]
--   type ∈ text | number | money | select | date | checkbox | url | user
--
-- Re-runnable.
-- ============================================================

ALTER TABLE mkt_lists ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb;
