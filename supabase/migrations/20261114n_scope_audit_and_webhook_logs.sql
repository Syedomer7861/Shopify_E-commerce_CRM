-- Narrow two logs every workspace member could read in full.
-- Needs 20261114m (can_manage_team).
--
-- audit_logs: members saw the whole workspace trail (settings changes,
-- system alerts, profile placement, other people's actions). Member screens
-- only need customer / task / marketing-task history and their own rows.
-- Replaces the narrower audit_logs_engine_rows rule with an allowlist.
-- Admins and anyone with audit:view keep the full trail.
DROP POLICY IF EXISTS audit_logs_engine_rows ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_member_scope ON public.audit_logs;
CREATE POLICY audit_logs_member_scope ON public.audit_logs AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR public.has_perm('audit', 'view')
    OR actor_id = auth.uid()
    OR entity_type IN ('customer', 'task', 'mkt_task')
  );

-- webhook_logs: raw Shopify / Shiprocket payloads (full addresses, emails,
-- order data) were readable by every role. Only admin screens and the
-- Settings page (manage_team) read them; the WhatsApp chat reads
-- source = 'whatsapp' rows.
DROP POLICY IF EXISTS webhook_logs_member_scope ON public.webhook_logs;
CREATE POLICY webhook_logs_member_scope ON public.webhook_logs AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR public.can_manage_team()
    OR source = 'whatsapp'
  );
