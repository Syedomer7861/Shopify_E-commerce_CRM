-- Message history and workflow logs were editable and deletable by any member of
-- the workspace (permissive org-only policies), so a member could rewrite or erase
-- what was sent to a customer. The app only ever INSERTs into these two tables
-- (lib/whatsapp.ts, lib/workflow-engine.ts), so edits and deletes are now admin-only.
-- workflow_instances keeps member updates (the workflow engine advances runs under
-- the member's session) but deleting a run becomes admin-only.
-- Additive: RESTRICTIVE policies only; existing policies and rows are untouched.
DROP POLICY IF EXISTS whatsapp_messages_admin_edit ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_admin_edit ON public.whatsapp_messages AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS whatsapp_messages_admin_delete ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_admin_delete ON public.whatsapp_messages AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS workflow_logs_admin_edit ON public.workflow_logs;
CREATE POLICY workflow_logs_admin_edit ON public.workflow_logs AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS workflow_logs_admin_delete ON public.workflow_logs;
CREATE POLICY workflow_logs_admin_delete ON public.workflow_logs AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS workflow_instances_admin_delete ON public.workflow_instances;
CREATE POLICY workflow_instances_admin_delete ON public.workflow_instances AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_admin());

-- Rollback:
-- DROP POLICY IF EXISTS whatsapp_messages_admin_edit ON public.whatsapp_messages;
-- DROP POLICY IF EXISTS whatsapp_messages_admin_delete ON public.whatsapp_messages;
-- DROP POLICY IF EXISTS workflow_logs_admin_edit ON public.workflow_logs;
-- DROP POLICY IF EXISTS workflow_logs_admin_delete ON public.workflow_logs;
-- DROP POLICY IF EXISTS workflow_instances_admin_delete ON public.workflow_instances;
