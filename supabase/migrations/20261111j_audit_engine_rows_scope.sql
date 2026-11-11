-- Follow-up to 20261111g for databases where it already ran. Safe to re-run.
-- audit_logs already carries an org-wide policy (any member reads every
-- audit row in their org; older screens such as task history depend on it).
-- The rows written by audit_row_change() contain whole records, so left
-- alone a peer could read someone else's lead, ticket or claim through the
-- audit log. Narrow just those rows to the actor and audit.view holders;
-- every older kind of audit row is untouched.
DROP POLICY IF EXISTS audit_logs_engine_rows ON audit_logs;
CREATE POLICY audit_logs_engine_rows ON audit_logs AS RESTRICTIVE FOR SELECT TO authenticated USING (
  (COALESCE(entity_type, '') NOT IN ('roles', 'branches', 'departments', 'designations', 'approvals', 'expenses',
                                     'vendors', 'invoices', 'tickets', 'leads', 'deals', 'visits')
   AND COALESCE(action, '') <> 'profile_placement_changed')
  OR actor_id = auth.uid()
  OR public.has_perm('audit', 'view'));
