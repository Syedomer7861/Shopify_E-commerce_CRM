-- Phase 1b, batch 4: org-scope RLS on the marketing/workspace tables
-- (mkt_*). This is the trickiest batch: access here already runs through
-- Space membership (can_access_space/is_space_owner/is_workspace_admin,
-- all from 20260829f_workspace_spaces.sql), not flat per-row ownership, and
-- two of those helpers short-circuit true for any admin/manager regardless
-- of which Space is being touched — so without a fix, an org-A admin's
-- is_workspace_admin()=true would still let them through to an org-B
-- Space. Fixing the 2 helper functions to also verify the TARGET SPACE's
-- org, rather than hand-rewriting the ~10 policies that call them, is both
-- the smaller diff and the actually-correct fix (every caller inherits it).
--
-- mkt_lists_read / mkt_tasks_read also have a `space_id IS NULL` escape
-- hatch (orphaned/global rows, visible to any authenticated user) that
-- doesn't go through the helpers at all — those get a direct org_id check.
-- Same for the tables with no space_id to chain through at all
-- (mkt_templates, mkt_comment_snippets, mkt_intake_requests,
-- mkt_saved_views, mkt_space_members): direct org_id check, since there's
-- no Space join to fix upstream.
--
-- Every policy below reproduced exactly as traced through
-- 20260829f_workspace_spaces.sql (latest for spaces/members/lists/tasks/
-- comments/task_links/attachments/automations/intake), 20260829c (templates,
-- saved_views — untouched since), 20260831b/c/f (time_entries/goals/
-- comment_snippets). Confirmed no later migration redefines any of them.

ALTER TABLE mkt_spaces         ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_space_members  ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_lists          ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_tasks          ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_comments       ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_task_links     ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_attachments    ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_automations    ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_templates      ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_intake_requests ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_saved_views    ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_time_entries   ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_goals          ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE mkt_comment_snippets ALTER COLUMN org_id SET DEFAULT public.current_org_id();

-- ------------------------------------------------------------
-- Fix the 2 helpers so every caller (10+ policies) inherits org-scoping.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_space(target_space UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT target_space IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.mkt_spaces s WHERE s.id = target_space AND s.org_id = public.current_org_id())
    AND (
      public.is_workspace_admin()
      OR EXISTS (
        SELECT 1 FROM public.mkt_space_members m
        WHERE m.space_id = target_space AND m.user_id = auth.uid()
      )
    );
$fn$;

CREATE OR REPLACE FUNCTION public.is_space_owner(target_space UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.mkt_spaces s WHERE s.id = target_space AND s.org_id = public.current_org_id())
    AND (
      public.is_workspace_admin()
      OR EXISTS (
        SELECT 1 FROM public.mkt_space_members m
        WHERE m.space_id = target_space AND m.user_id = auth.uid() AND m.role = 'owner'
      )
    );
$fn$;

-- mkt_spaces
DROP POLICY IF EXISTS "mkt_spaces_read" ON mkt_spaces;
CREATE POLICY "mkt_spaces_read" ON mkt_spaces FOR SELECT TO authenticated
  USING (public.can_access_space(id));
DROP POLICY IF EXISTS "mkt_spaces_create" ON mkt_spaces;
CREATE POLICY "mkt_spaces_create" ON mkt_spaces FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin() AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "mkt_spaces_manage" ON mkt_spaces;
CREATE POLICY "mkt_spaces_manage" ON mkt_spaces FOR UPDATE TO authenticated
  USING (public.is_space_owner(id)) WITH CHECK (public.is_space_owner(id));
DROP POLICY IF EXISTS "mkt_spaces_delete" ON mkt_spaces;
CREATE POLICY "mkt_spaces_delete" ON mkt_spaces FOR DELETE TO authenticated
  USING (public.is_workspace_admin() AND org_id = public.current_org_id());

-- mkt_space_members (no space join to chain through its own org_id — direct check)
DROP POLICY IF EXISTS "mkt_space_members_read" ON mkt_space_members;
CREATE POLICY "mkt_space_members_read" ON mkt_space_members FOR SELECT TO authenticated
  USING ((user_id = auth.uid() OR public.can_access_space(space_id)) AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "mkt_space_members_manage" ON mkt_space_members;
CREATE POLICY "mkt_space_members_manage" ON mkt_space_members FOR ALL TO authenticated
  USING (public.is_space_owner(space_id) AND org_id = public.current_org_id())
  WITH CHECK (public.is_space_owner(space_id) AND org_id = public.current_org_id());

-- mkt_lists (space_id IS NULL escape hatch needs its own direct check)
DROP POLICY IF EXISTS "mkt_lists_read" ON mkt_lists;
CREATE POLICY "mkt_lists_read" ON mkt_lists FOR SELECT TO authenticated
  USING ((space_id IS NULL OR public.can_access_space(space_id)) AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "mkt_lists_write" ON mkt_lists;
CREATE POLICY "mkt_lists_write" ON mkt_lists FOR ALL TO authenticated
  USING (public.can_access_space(space_id) AND org_id = public.current_org_id())
  WITH CHECK (public.can_access_space(space_id) AND org_id = public.current_org_id());

-- mkt_tasks
DROP POLICY IF EXISTS "mkt_tasks_read" ON mkt_tasks;
CREATE POLICY "mkt_tasks_read" ON mkt_tasks FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM mkt_lists l WHERE l.id = mkt_tasks.list_id
        AND (l.space_id IS NULL OR public.can_access_space(l.space_id))
    )
  );
DROP POLICY IF EXISTS "mkt_tasks_write" ON mkt_tasks;
CREATE POLICY "mkt_tasks_write" ON mkt_tasks FOR ALL TO authenticated
  USING (org_id = public.current_org_id()
    AND EXISTS (SELECT 1 FROM mkt_lists l WHERE l.id = mkt_tasks.list_id AND public.can_access_space(l.space_id)))
  WITH CHECK (org_id = public.current_org_id()
    AND EXISTS (SELECT 1 FROM mkt_lists l WHERE l.id = mkt_tasks.list_id AND public.can_access_space(l.space_id)));

-- mkt_comments
DROP POLICY IF EXISTS "mkt_comments_rw" ON mkt_comments;
CREATE POLICY "mkt_comments_rw" ON mkt_comments FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (author_id = auth.uid() OR EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_comments.task_id AND public.can_access_space(l.space_id))))
  WITH CHECK (org_id = public.current_org_id() AND (author_id = auth.uid() OR EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_comments.task_id AND public.can_access_space(l.space_id))));

-- mkt_task_links
DROP POLICY IF EXISTS "mkt_task_links_rw" ON mkt_task_links;
CREATE POLICY "mkt_task_links_rw" ON mkt_task_links FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_task_links.task_id AND public.can_access_space(l.space_id)))
  WITH CHECK (org_id = public.current_org_id() AND EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_task_links.task_id AND public.can_access_space(l.space_id)));

-- mkt_attachments
DROP POLICY IF EXISTS "mkt_attachments_rw" ON mkt_attachments;
CREATE POLICY "mkt_attachments_rw" ON mkt_attachments FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_attachments.task_id AND public.can_access_space(l.space_id)))
  WITH CHECK (org_id = public.current_org_id() AND EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_attachments.task_id AND public.can_access_space(l.space_id)));

-- mkt_automations (list_id IS NULL global-automation escape needs a direct check too)
DROP POLICY IF EXISTS "mkt_automations_rw" ON mkt_automations;
CREATE POLICY "mkt_automations_rw" ON mkt_automations FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (
    public.is_workspace_admin()
    OR list_id IS NULL
    OR EXISTS (SELECT 1 FROM mkt_lists l WHERE l.id = mkt_automations.list_id AND public.can_access_space(l.space_id))
  ))
  WITH CHECK (org_id = public.current_org_id() AND (
    public.is_workspace_admin()
    OR list_id IS NULL
    OR EXISTS (SELECT 1 FROM mkt_lists l WHERE l.id = mkt_automations.list_id AND public.can_access_space(l.space_id))
  ));

-- mkt_templates (no space_id at all — direct check)
DROP POLICY IF EXISTS "mkt_templates_rw" ON mkt_templates;
CREATE POLICY "mkt_templates_rw" ON mkt_templates FOR ALL TO authenticated
  USING (public.is_marketing_staff() AND org_id = public.current_org_id())
  WITH CHECK (public.is_marketing_staff() AND org_id = public.current_org_id());

-- mkt_intake_requests (no space_id — direct check)
DROP POLICY IF EXISTS "mkt_intake_read" ON mkt_intake_requests;
CREATE POLICY "mkt_intake_read" ON mkt_intake_requests FOR SELECT TO authenticated
  USING ((public.is_marketing_staff() OR requester_id = auth.uid()) AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "mkt_intake_insert" ON mkt_intake_requests;
CREATE POLICY "mkt_intake_insert" ON mkt_intake_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "mkt_intake_manage" ON mkt_intake_requests;
CREATE POLICY "mkt_intake_manage" ON mkt_intake_requests FOR UPDATE TO authenticated
  USING (public.is_marketing_staff() AND org_id = public.current_org_id())
  WITH CHECK (public.is_marketing_staff() AND org_id = public.current_org_id());

-- mkt_saved_views (no space_id — direct check)
DROP POLICY IF EXISTS "mkt_saved_views_rw" ON mkt_saved_views;
CREATE POLICY "mkt_saved_views_rw" ON mkt_saved_views FOR ALL TO authenticated
  USING (user_id = auth.uid() AND org_id = public.current_org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = public.current_org_id());

-- mkt_time_entries
DROP POLICY IF EXISTS "mkt_time_entries_rw" ON mkt_time_entries;
CREATE POLICY "mkt_time_entries_rw" ON mkt_time_entries FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_time_entries.task_id
      AND (l.space_id IS NULL OR public.can_access_space(l.space_id))
  ))
  WITH CHECK (org_id = public.current_org_id() AND EXISTS (
    SELECT 1 FROM mkt_tasks t JOIN mkt_lists l ON l.id = t.list_id
    WHERE t.id = mkt_time_entries.task_id
      AND (l.space_id IS NULL OR public.can_access_space(l.space_id))
  ));

-- mkt_goals
DROP POLICY IF EXISTS "mkt_goals_read" ON mkt_goals;
CREATE POLICY "mkt_goals_read" ON mkt_goals FOR SELECT TO authenticated
  USING (public.can_access_space(space_id));
DROP POLICY IF EXISTS "mkt_goals_write" ON mkt_goals;
CREATE POLICY "mkt_goals_write" ON mkt_goals FOR ALL TO authenticated
  USING (public.is_space_owner(space_id)) WITH CHECK (public.is_space_owner(space_id));

-- mkt_comment_snippets (no space_id — direct check)
DROP POLICY IF EXISTS "mkt_comment_snippets_read" ON mkt_comment_snippets;
CREATE POLICY "mkt_comment_snippets_read" ON mkt_comment_snippets FOR SELECT TO authenticated
  USING (public.is_marketing_staff() AND org_id = public.current_org_id());
DROP POLICY IF EXISTS "mkt_comment_snippets_write" ON mkt_comment_snippets;
CREATE POLICY "mkt_comment_snippets_write" ON mkt_comment_snippets FOR ALL TO authenticated
  USING (public.is_workspace_admin() AND org_id = public.current_org_id())
  WITH CHECK (public.is_workspace_admin() AND org_id = public.current_org_id());
