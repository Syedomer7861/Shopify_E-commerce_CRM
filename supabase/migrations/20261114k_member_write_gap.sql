-- Close the in-workspace write gap found by the 2026-11-14 audit.
--
-- These tables had one permissive FOR ALL policy, org_id = current_org_id(),
-- so any member (an agent included) could create, edit or delete rows with
-- a direct API call. A campaign row is what the campaign-sender cron blasts
-- to customers, so that mattered.
--
-- Additive only: RESTRICTIVE policies on top of the existing ones (nothing
-- dropped). Reads are untouched. Service-role callers (crons, webhooks)
-- bypass RLS and are unaffected. Predicates reuse what the DB already has:
-- is_admin(), has_role('hr') (payroll_runs), has_perm('workflows','manage')
-- (managers hold it by default; the Roles page can grant it).
--
-- Deliberately left open: workflow_instances, workflow_logs and
-- whatsapp_messages. The workflow engine and WhatsApp sender write them
-- under the acting member's own session (an agent completing a task fires
-- a flow), so restricting them would break everyday work.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_automations()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_admin() OR public.has_perm('workflows', 'manage');
$$;
REVOKE ALL ON FUNCTION public.can_manage_automations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_automations() TO authenticated, service_role;

-- campaigns: members may still create a DRAFT (marketing automations do);
-- scheduling, editing and deleting need automation rights.
CREATE POLICY campaigns_guard_insert ON public.campaigns AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_automations() OR status = 'draft');
CREATE POLICY campaigns_guard_update ON public.campaigns AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_manage_automations()) WITH CHECK (public.can_manage_automations());
CREATE POLICY campaigns_guard_delete ON public.campaigns AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_manage_automations());

-- campaign_templates, workflow_steps: automation rights for every write.
CREATE POLICY campaign_templates_guard_insert ON public.campaign_templates AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_automations());
CREATE POLICY campaign_templates_guard_update ON public.campaign_templates AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_manage_automations()) WITH CHECK (public.can_manage_automations());
CREATE POLICY campaign_templates_guard_delete ON public.campaign_templates AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_manage_automations());

CREATE POLICY workflow_steps_guard_insert ON public.workflow_steps AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_automations());
CREATE POLICY workflow_steps_guard_update ON public.workflow_steps AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_manage_automations()) WITH CHECK (public.can_manage_automations());
CREATE POLICY workflow_steps_guard_delete ON public.workflow_steps AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_manage_automations());

-- workflows: 'rule' rows already need has_perm (workflows_rules_*); the
-- other kinds (automation sequences) now need automation rights too.
CREATE POLICY workflows_guard_insert ON public.workflows AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (kind = 'rule' OR public.can_manage_automations());
CREATE POLICY workflows_guard_update ON public.workflows AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (kind = 'rule' OR public.can_manage_automations())
  WITH CHECK (kind = 'rule' OR public.can_manage_automations());
CREATE POLICY workflows_guard_delete ON public.workflows AS RESTRICTIVE FOR DELETE TO authenticated
  USING (kind = 'rule' OR public.can_manage_automations());

-- holidays: admin or HR, same rule as payroll_runs.
CREATE POLICY holidays_guard_insert ON public.holidays AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.has_role('hr'));
CREATE POLICY holidays_guard_update ON public.holidays AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.has_role('hr')) WITH CHECK (public.is_admin() OR public.has_role('hr'));
CREATE POLICY holidays_guard_delete ON public.holidays AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_admin() OR public.has_role('hr'));

-- lead_scores: nothing in the app writes it yet; admins only.
CREATE POLICY lead_scores_guard_insert ON public.lead_scores AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY lead_scores_guard_update ON public.lead_scores AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY lead_scores_guard_delete ON public.lead_scores AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_admin());

COMMIT;
