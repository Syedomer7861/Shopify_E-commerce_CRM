-- ============================================================
-- CureForever CRM — Marketing Workspace (ClickUp-style department module)
--
-- Adds a self-contained task workspace for the Marketing team:
--   mkt_lists            board columns live in list.statuses (jsonb)
--   mkt_tasks            tasks + subtasks (parent_task_id), fractional position
--   mkt_comments         per-task comments with @mentions
--   mkt_task_links       task dependencies (blocks / blocked_by / relates_to)
--   mkt_attachments      file references (Supabase Storage)
--   mkt_templates        reusable task / list templates
--   mkt_automations      status-change rules
--   mkt_intake_requests  creative requests from other departments
--   mkt_saved_views      per-user saved filters
--
-- No coupling to the customer-callback `tasks` table. Nothing in the app
-- queries these tables until the Marketing UI ships, so this migration is
-- safe to apply ahead of the feature code.
--
-- Every statement is guarded (IF NOT EXISTS / DROP ... IF EXISTS), so this
-- is re-runnable and a no-op where objects already exist.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Role + gate helper
-- ------------------------------------------------------------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'agent', 'hr', 'manager', 'marketing'));

-- Mirrors lib/permissions.ts canAccessMarketing(): admin, manager, the
-- marketing role, or an explicit manage_marketing permission flag.
CREATE OR REPLACE FUNCTION public.is_marketing_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role IN ('admin', 'manager', 'marketing')
        OR COALESCE((permissions ->> 'manage_marketing')::boolean, false)
      )
  );
$fn$;

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mkt_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL,
  color       VARCHAR(20),
  icon        VARCHAR(40),
  position    DOUBLE PRECISION NOT NULL DEFAULT 1000,
  archived    BOOLEAN NOT NULL DEFAULT false,
  statuses    JSONB NOT NULL DEFAULT '[
    {"id":"backlog","name":"Backlog","color":"#8b8b8b","type":"not_started"},
    {"id":"in_progress","name":"In Progress","color":"#3b82f6","type":"active"},
    {"id":"review","name":"Review","color":"#f59e0b","type":"active"},
    {"id":"done","name":"Done","color":"#10b981","type":"done"}
  ]'::jsonb,
  wip_limit   INTEGER,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mkt_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id         UUID NOT NULL REFERENCES mkt_lists(id) ON DELETE CASCADE,
  parent_task_id  UUID REFERENCES mkt_tasks(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'backlog',
  priority        VARCHAR(10) NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('urgent','high','normal','low')),
  start_date      DATE,
  due_date        DATE,
  assignees       UUID[] NOT NULL DEFAULT '{}',
  watchers        UUID[] NOT NULL DEFAULT '{}',
  tags            TEXT[] NOT NULL DEFAULT '{}',
  custom_fields   JSONB NOT NULL DEFAULT '{}'::jsonb,
  position        DOUBLE PRECISION NOT NULL DEFAULT 1000,
  source_ref      JSONB,
  recurrence      JSONB,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mkt_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES mkt_tasks(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  mentions    UUID[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mkt_task_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES mkt_tasks(id) ON DELETE CASCADE,
  target_task_id  UUID NOT NULL REFERENCES mkt_tasks(id) ON DELETE CASCADE,
  kind            VARCHAR(20) NOT NULL DEFAULT 'relates_to'
                  CHECK (kind IN ('blocks','blocked_by','relates_to')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mkt_task_links_unique UNIQUE (task_id, target_task_id, kind),
  CONSTRAINT mkt_task_links_no_self CHECK (task_id <> target_task_id)
);

CREATE TABLE IF NOT EXISTS mkt_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES mkt_tasks(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  mime          VARCHAR(120),
  size_bytes    BIGINT,
  uploaded_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mkt_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(160) NOT NULL,
  kind        VARCHAR(10) NOT NULL CHECK (kind IN ('task','list')),
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mkt_automations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     UUID REFERENCES mkt_lists(id) ON DELETE CASCADE,
  name        VARCHAR(160) NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  trigger     JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mkt_intake_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  details          TEXT,
  desired_date     DATE,
  ref              JSONB,
  status           VARCHAR(12) NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','accepted','rejected')),
  created_task_id  UUID REFERENCES mkt_tasks(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mkt_saved_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  list_id     UUID REFERENCES mkt_lists(id) ON DELETE CASCADE,
  name        VARCHAR(120) NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mkt_lists_board       ON mkt_lists (archived, position);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_board       ON mkt_tasks (list_id, status, position);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_parent      ON mkt_tasks (parent_task_id);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_due         ON mkt_tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_assignees   ON mkt_tasks USING gin (assignees);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_tags        ON mkt_tasks USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_mkt_comments_task     ON mkt_comments (task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mkt_links_task        ON mkt_task_links (task_id);
CREATE INDEX IF NOT EXISTS idx_mkt_attachments_task  ON mkt_attachments (task_id);
CREATE INDEX IF NOT EXISTS idx_mkt_intake_status     ON mkt_intake_requests (status, created_at);
CREATE INDEX IF NOT EXISTS idx_mkt_saved_views_user  ON mkt_saved_views (user_id);

-- ------------------------------------------------------------
-- 3. updated_at trigger (reuses whatever the repo already has, else defines)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mkt_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mkt_lists_touch ON mkt_lists;
CREATE TRIGGER trg_mkt_lists_touch BEFORE UPDATE ON mkt_lists
  FOR EACH ROW EXECUTE FUNCTION public.mkt_touch_updated_at();

DROP TRIGGER IF EXISTS trg_mkt_tasks_touch ON mkt_tasks;
CREATE TRIGGER trg_mkt_tasks_touch BEFORE UPDATE ON mkt_tasks
  FOR EACH ROW EXECUTE FUNCTION public.mkt_touch_updated_at();

-- ------------------------------------------------------------
-- 4. Row Level Security
--    Marketing staff (see is_marketing_staff): full read/write.
--    Any other authenticated user: read-only on lists + tasks (so the
--    calendar / cross-links work), and may file intake requests.
-- ------------------------------------------------------------
ALTER TABLE mkt_lists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_task_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_attachments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_automations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_intake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_saved_views     ENABLE ROW LEVEL SECURITY;

-- lists
DROP POLICY IF EXISTS "mkt_lists_read"  ON mkt_lists;
CREATE POLICY "mkt_lists_read"  ON mkt_lists FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mkt_lists_write" ON mkt_lists;
CREATE POLICY "mkt_lists_write" ON mkt_lists FOR ALL TO authenticated
  USING (public.is_marketing_staff()) WITH CHECK (public.is_marketing_staff());

-- tasks
DROP POLICY IF EXISTS "mkt_tasks_read"  ON mkt_tasks;
CREATE POLICY "mkt_tasks_read"  ON mkt_tasks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mkt_tasks_write" ON mkt_tasks;
CREATE POLICY "mkt_tasks_write" ON mkt_tasks FOR ALL TO authenticated
  USING (public.is_marketing_staff()) WITH CHECK (public.is_marketing_staff());

-- comments: marketing staff full; author can always see/edit own
DROP POLICY IF EXISTS "mkt_comments_rw" ON mkt_comments;
CREATE POLICY "mkt_comments_rw" ON mkt_comments FOR ALL TO authenticated
  USING (public.is_marketing_staff() OR author_id = auth.uid())
  WITH CHECK (public.is_marketing_staff() OR author_id = auth.uid());

-- links / attachments / templates / automations / saved views: marketing staff only
DROP POLICY IF EXISTS "mkt_task_links_rw" ON mkt_task_links;
CREATE POLICY "mkt_task_links_rw" ON mkt_task_links FOR ALL TO authenticated
  USING (public.is_marketing_staff()) WITH CHECK (public.is_marketing_staff());

DROP POLICY IF EXISTS "mkt_attachments_rw" ON mkt_attachments;
CREATE POLICY "mkt_attachments_rw" ON mkt_attachments FOR ALL TO authenticated
  USING (public.is_marketing_staff()) WITH CHECK (public.is_marketing_staff());

DROP POLICY IF EXISTS "mkt_templates_rw" ON mkt_templates;
CREATE POLICY "mkt_templates_rw" ON mkt_templates FOR ALL TO authenticated
  USING (public.is_marketing_staff()) WITH CHECK (public.is_marketing_staff());

DROP POLICY IF EXISTS "mkt_automations_rw" ON mkt_automations;
CREATE POLICY "mkt_automations_rw" ON mkt_automations FOR ALL TO authenticated
  USING (public.is_marketing_staff()) WITH CHECK (public.is_marketing_staff());

DROP POLICY IF EXISTS "mkt_saved_views_rw" ON mkt_saved_views;
CREATE POLICY "mkt_saved_views_rw" ON mkt_saved_views FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- intake: anyone authenticated may create + read their own; marketing staff see + manage all
DROP POLICY IF EXISTS "mkt_intake_read" ON mkt_intake_requests;
CREATE POLICY "mkt_intake_read" ON mkt_intake_requests FOR SELECT TO authenticated
  USING (public.is_marketing_staff() OR requester_id = auth.uid());
DROP POLICY IF EXISTS "mkt_intake_insert" ON mkt_intake_requests;
CREATE POLICY "mkt_intake_insert" ON mkt_intake_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());
DROP POLICY IF EXISTS "mkt_intake_manage" ON mkt_intake_requests;
CREATE POLICY "mkt_intake_manage" ON mkt_intake_requests FOR UPDATE TO authenticated
  USING (public.is_marketing_staff()) WITH CHECK (public.is_marketing_staff());

-- ------------------------------------------------------------
-- 5. Seed: one starter list + one intake list, only if the board is empty
-- ------------------------------------------------------------
INSERT INTO mkt_lists (name, color, icon, position)
SELECT 'Content Calendar', '#3b82f6', 'calendar', 1000
WHERE NOT EXISTS (SELECT 1 FROM mkt_lists);

INSERT INTO mkt_lists (name, color, icon, position, statuses)
SELECT 'Requests Inbox', '#f59e0b', 'inbox', 2000,
  '[
    {"id":"new","name":"New","color":"#8b8b8b","type":"not_started"},
    {"id":"accepted","name":"Accepted","color":"#3b82f6","type":"active"},
    {"id":"done","name":"Delivered","color":"#10b981","type":"done"}
  ]'::jsonb
WHERE (SELECT count(*) FROM mkt_lists) = 1;
