-- api/webhooks/whatsapp/route.ts has been writing sentiment/is_urgent on
-- tasks since it was written, but no migration ever created these columns -
-- the negative-sentiment escalation (jump priority to 150, flag urgent) has
-- been silently failing (PostgREST rejects the unknown-column update, the
-- webhook doesn't check the error) on every negative WhatsApp reply.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_is_urgent ON tasks(is_urgent) WHERE is_urgent = true;
