-- ============================================================
-- CureForever CRM — Workspace: Spaces + per-space membership
--
-- Generalizes the marketing-only module into a multi-team workspace
-- (ClickUp Space -> List -> Task). Depends on 20260829c/d/e.
--
--   mkt_spaces          a team's area (Marketing, Amazon Ops, Ads, ...)
--   mkt_space_members   who can see/use a space (owner | member)
--   mkt_lists.space_id  every list now belongs to a space
--
-- Access model: a user sees a space (and its lists/tasks/etc.) if they are
-- a member of it, or if they are an admin/manager, or hold the
-- manage_workspaces permission. is_marketing_staff() is kept as a
-- compatibility alias.
--
-- Re-runnable: guarded throughout.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mkt_spaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL,
  color       VARCHAR(20),
  icon        VARCHAR(40),
  position    DOUBLE PRECISION NOT NULL DEFAULT 1000,
  archived    BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mkt_space_members (
  space_id   UUID NOT NULL REFERENCES mkt_spaces(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  added_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

ALTER TABLE mkt_lists ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES mkt_spaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_mkt_spaces_board       ON mkt_spaces (archived, position);
CREATE INDEX IF NOT EXISTS idx_mkt_space_members_user ON mkt_space_members (user_id);
CREATE INDEX IF NOT EXISTS idx_mkt_lists_space        ON mkt_lists (space_id, archived, position);

DROP TRIGGER IF EXISTS trg_mkt_spaces_touch ON mkt_spaces;
CREATE TRIGGER trg_mkt_spaces_touch BEFORE UPDATE ON mkt_spaces
  FOR EACH ROW EXECUTE FUNCTION public.mkt_touch_updated_at();

-- ------------------------------------------------------------
-- 2. Access helpers
-- ------------------------------------------------------------
-- Blanket workspace privilege: admins, managers, or an explicit flag.
CREATE OR REPLACE FUNCTION public.is_workspace_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role IN ('admin', 'manager')
        OR COALESCE((permissions ->> 'manage_workspaces')::boolean, false)
        OR COALESCE((permissions ->> 'manage_marketing')::boolean, false)  -- legacy flag
      )
  );
$fn$;

-- Can the caller see this space? Member, or workspace-admin.
CREATE OR REPLACE FUNCTION public.can_access_space(target_space UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT target_space IS NOT NULL AND (
    public.is_workspace_admin()
    OR EXISTS (
      SELECT 1 FROM public.mkt_space_members m
      WHERE m.space_id = target_space AND m.user_id = auth.uid()
    )
  );
$fn$;

-- Owner of a space (or workspace-admin) — may manage members / settings.
CREATE OR REPLACE FUNCTION public.is_space_owner(target_space UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.is_workspace_admin() OR EXISTS (
    SELECT 1 FROM public.mkt_space_members m
    WHERE m.space_id = target_space AND m.user_id = auth.uid() AND m.role = 'owner'
  );
$fn$;

-- Keep the old name working — now "can use the workspace at all".
CREATE OR REPLACE FUNCTION public.is_marketing_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.is_workspace_admin() OR EXISTS (
    SELECT 1 FROM public.mkt_space_members WHERE user_id = auth.uid()
  );
$fn$;

-- ------------------------------------------------------------
-- 3. Seed: a "Marketing" space, adopt the existing lists into it
-- ------------------------------------------------------------
INSERT INTO mkt_spaces (name, color, icon, position)
SELECT 'Marketing', '#3b82f6', 'megaphone', 1000
WHERE NOT EXISTS (SELECT 1 FROM mkt_spaces);

DO $$
DECLARE mkt_space UUID;
BEGIN
  SELECT id INTO mkt_space FROM mkt_spaces ORDER BY position ASC LIMIT 1;
  IF mkt_space IS NOT NULL THEN
    UPDATE mkt_lists SET space_id = mkt_space WHERE space_id IS NULL;
    -- Everyone who previously qualified as marketing staff becomes a member;
    -- the first admin (or any) becomes the owner.
    INSERT INTO mkt_space_members (space_id, user_id, role)
    SELECT mkt_space, p.id,
           CASE WHEN p.role = 'admin' THEN 'owner' ELSE 'member' END
    FROM profiles p
    WHERE p.is_active
      AND (
        p.role IN ('admin', 'manager', 'marketing')
        OR COALESCE((p.permissions ->> 'manage_marketing')::boolean, false)
      )
    ON CONFLICT (space_id, user_id) DO NOTHING;

    -- Guarantee at least one owner.
    IF NOT EXISTS (SELECT 1 FROM mkt_space_members WHERE space_id = mkt_space AND role = 'owner') THEN
      UPDATE mkt_space_members SET role = 'owner'
      WHERE ctid = (SELECT ctid FROM mkt_space_members WHERE space_id = mkt_space LIMIT 1);
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
ALTER TABLE mkt_spaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_space_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mkt_spaces_read"   ON mkt_spaces;
CREATE POLICY "mkt_spaces_read"   ON mkt_spaces FOR SELECT TO authenticated
  USING (public.can_access_space(id));
DROP POLICY IF EXISTS "mkt_spaces_create" ON mkt_spaces;
CREATE POLICY "mkt_spaces_create" ON mkt_spaces FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin());
DROP POLICY IF EXISTS "mkt_spaces_manage" ON mkt_spaces;
CREATE POLICY "mkt_spaces_manage" ON mkt_spaces FOR UPDATE TO authenticated
  USING (public.is_space_owner(id)) WITH CHECK (public.is_space_owner(id));
DROP POLICY IF EXISTS "mkt_spaces_delete" ON mkt_spaces;
CREATE POLICY "mkt_spaces_delete" ON mkt_spaces FOR DELETE TO authenticated
  USING (public.is_workspace_admin());

DROP POLICY IF EXISTS "mkt_space_members_read"   ON mkt_space_members;
CREATE POLICY "mkt_space_members_read"   ON mkt_space_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_access_space(space_id));
DROP POLICY IF EXISTS "mkt_space_members_manage" ON mkt_space_members;
CREATE POLICY "mkt_space_members_manage" ON mkt_space_members FOR ALL TO authenticated
  USING (public.is_space_owner(space_id)) WITH CHECK (public.is_space_owner(space_id));

-- Re-gate the content tables on space membership. Read stays broad on the
-- ones other departments legitimately need (calendar overlay, cross-links);
-- writes require space access.
DROP POLICY IF EXISTS "mkt_lists_read"  ON mkt_lists;
CREATE POLICY "mkt_lists_read"  ON mkt_lists FOR SELECT TO authenticated
  USING (space_id IS NULL OR public.can_access_space(space_id));
DROP POLICY IF EXISTS "mkt_lists_write" ON mkt_lists;
CREATE POLICY "mkt_lists_write" ON mkt_lists FOR ALL TO authenticated
  USING (public.can_access_space(space_id)) WITH CHECK (public.can_access_space(space_id));

DROP POLICY IF EXISTS "mkt_tasks_read"  ON mkt_tasks;
CREATE POLICY "mkt_tasks_read"  ON mkt_tasks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM mkt_lists l WHERE l.id = mkt_tasks.list_id
      AND (l.space_id IS NULL OR public.can_access_space(l.space_id))
  ));
DROP POLICY IF EXISTS "mkt_tasks_write" ON mkt_tasks;
CREATE POLICY "mkt_tasks_write" ON mkt_tasks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM mkt_lists l WHERE l.id = mkt_tasks.list_id AND public.can_access_space(l.space_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM mkt_lists l WHERE l.id = mkt_tasks.list_id AND public.can_access_space(l.space_id)));

DROP POLICY IF EXISTS "mkt_comments_rw" ON mkt_comments;
CREATE POLICY "mkt_comments_rw" ON mkt_comments FOR ALL TO authenticated
  USING (author_id = auth.uid() OR EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_comments.task_id AND public.can_access_space(l.space_id)))
  WITH CHECK (author_id = auth.uid() OR EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_comments.task_id AND public.can_access_space(l.space_id)));

DROP POLICY IF EXISTS "mkt_task_links_rw" ON mkt_task_links;
CREATE POLICY "mkt_task_links_rw" ON mkt_task_links FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_task_links.task_id AND public.can_access_space(l.space_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_task_links.task_id AND public.can_access_space(l.space_id)));

DROP POLICY IF EXISTS "mkt_attachments_rw" ON mkt_attachments;
CREATE POLICY "mkt_attachments_rw" ON mkt_attachments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_attachments.task_id AND public.can_access_space(l.space_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_attachments.task_id AND public.can_access_space(l.space_id)));

-- Automations are list-scoped (or global) — gate list-scoped ones by space.
DROP POLICY IF EXISTS "mkt_automations_rw" ON mkt_automations;
CREATE POLICY "mkt_automations_rw" ON mkt_automations FOR ALL TO authenticated
  USING (
    public.is_workspace_admin()
    OR list_id IS NULL
    OR EXISTS (SELECT 1 FROM mkt_lists l WHERE l.id = mkt_automations.list_id AND public.can_access_space(l.space_id))
  )
  WITH CHECK (
    public.is_workspace_admin()
    OR list_id IS NULL
    OR EXISTS (SELECT 1 FROM mkt_lists l WHERE l.id = mkt_automations.list_id AND public.can_access_space(l.space_id))
  );

-- templates: any workspace user may use/create.
DROP POLICY IF EXISTS "mkt_templates_rw" ON mkt_templates;
CREATE POLICY "mkt_templates_rw" ON mkt_templates FOR ALL TO authenticated
  USING (public.is_marketing_staff()) WITH CHECK (public.is_marketing_staff());

-- intake: unchanged — anyone files, workspace users triage.
DROP POLICY IF EXISTS "mkt_intake_manage" ON mkt_intake_requests;
CREATE POLICY "mkt_intake_manage" ON mkt_intake_requests FOR UPDATE TO authenticated
  USING (public.is_marketing_staff()) WITH CHECK (public.is_marketing_staff());
