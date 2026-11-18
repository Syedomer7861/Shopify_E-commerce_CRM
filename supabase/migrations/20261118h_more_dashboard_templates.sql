-- Eleven more global dashboard templates: the field team (offline sales)
-- command view plus ten roles and departments.
--
-- Configuration only, no business data. Widget keys come from the app's
-- registry (src/components/workspace/WorkspaceHome.tsx); every widget still
-- checks the viewer's own access and reads through RLS, so a template never
-- shows more than the person may see. Inserted only when a global template
-- of the same name doesn't exist, so it is safe to re-run.
--
-- Rollback:
--   DELETE FROM public.dashboard_versions WHERE dashboard_id IN (SELECT id FROM public.dashboards WHERE org_id IS NULL AND name IN
--     ('Field team (offline sales)','Field sales manager','Sales head','Inside sales / telecalling','Support lead','Accounts & finance manager',
--      'Operations & fulfilment','Marketing','Founder / CEO','Project & delivery lead','Office admin','New joiner'));
--   DELETE FROM public.dashboards WHERE org_id IS NULL AND name IN (same list);
--   (dashboard_versions is append-only for users; run the rollback as the database owner.)

BEGIN;

WITH t(name, description, category, layout) AS (VALUES
  ('Field team (offline sales)', 'Live map of check-ins and routes, visits that need attention, photo proof, today''s visits and KPI score.', 'Field team',
   '[{"id":"w1","widget":"field-command","size":"full"},{"id":"w2","widget":"field-overview","size":"full"},{"id":"w3","widget":"assigned-tasks","size":"m"},{"id":"w4","widget":"approvals","size":"m"},{"id":"w5","widget":"kpi-scorecard","size":"full"},{"id":"w6","widget":"announcements","size":"full"}]'::jsonb),
  ('Field sales manager', 'Team map and routes, missed visits, the sales pipeline and approvals for a field team lead.', 'Field team',
   '[{"id":"w1","widget":"field-command","size":"full"},{"id":"w2","widget":"field-overview","size":"full"},{"id":"w3","widget":"sales-overview","size":"full"},{"id":"w4","widget":"approvals","size":"m"},{"id":"w5","widget":"assigned-tasks","size":"m"}]'::jsonb),
  ('Sales head', 'Pipeline, orders and revenue, module counts, approvals and KPI score.', 'Sales',
   '[{"id":"w1","widget":"pulse","size":"full"},{"id":"w2","widget":"sales-overview","size":"full"},{"id":"w3","widget":"orders","size":"full"},{"id":"w4","widget":"approvals","size":"m"},{"id":"w5","widget":"assigned-tasks","size":"m"},{"id":"w6","widget":"kpi-scorecard","size":"full"}]'::jsonb),
  ('Inside sales / telecalling', 'Lead funnel, tasks assigned to me, own work and KPI score for callers.', 'Sales',
   '[{"id":"w1","widget":"sales-overview","size":"full"},{"id":"w2","widget":"assigned-tasks","size":"m"},{"id":"w3","widget":"approvals","size":"m"},{"id":"w4","widget":"my-work","size":"full"},{"id":"w5","widget":"kpi-scorecard","size":"full"}]'::jsonb),
  ('Support lead', 'Service desk health, SLA breaches, approvals and team announcements.', 'Support',
   '[{"id":"w1","widget":"support-overview","size":"full"},{"id":"w2","widget":"approvals","size":"m"},{"id":"w3","widget":"assigned-tasks","size":"m"},{"id":"w4","widget":"kpi-scorecard","size":"full"},{"id":"w5","widget":"announcements","size":"full"}]'::jsonb),
  ('Accounts & finance manager', 'Claims and invoices due, orders and revenue, approvals waiting.', 'Finance',
   '[{"id":"w1","widget":"finance-overview","size":"full"},{"id":"w2","widget":"orders","size":"full"},{"id":"w3","widget":"approvals","size":"m"},{"id":"w4","widget":"assigned-tasks","size":"m"}]'::jsonb),
  ('Operations & fulfilment', 'Orders and revenue, module counts, tasks and approvals for the ops desk.', 'Operations',
   '[{"id":"w1","widget":"orders","size":"full"},{"id":"w2","widget":"pulse","size":"full"},{"id":"w3","widget":"assigned-tasks","size":"m"},{"id":"w4","widget":"approvals","size":"m"},{"id":"w5","widget":"my-work","size":"full"}]'::jsonb),
  ('Marketing', 'Campaign work and deadlines, lead funnel, orders and announcements.', 'Marketing',
   '[{"id":"w1","widget":"my-work","size":"full"},{"id":"w2","widget":"sales-overview","size":"full"},{"id":"w3","widget":"orders","size":"full"},{"id":"w4","widget":"assigned-tasks","size":"m"},{"id":"w5","widget":"approvals","size":"m"},{"id":"w6","widget":"announcements","size":"full"}]'::jsonb),
  ('Founder / CEO', 'The whole business on one page: counts, revenue, pipeline, finance, field team and organisation.', 'Management',
   '[{"id":"w1","widget":"pulse","size":"full"},{"id":"w2","widget":"orders","size":"full"},{"id":"w3","widget":"sales-overview","size":"full"},{"id":"w4","widget":"finance-overview","size":"full"},{"id":"w5","widget":"field-overview","size":"full"},{"id":"w6","widget":"org-snapshot","size":"full"},{"id":"w7","widget":"approvals","size":"m"}]'::jsonb),
  ('Project & delivery lead', 'Projects, deadlines and hours, tasks assigned, approvals and announcements.', 'Technology',
   '[{"id":"w1","widget":"my-work","size":"full"},{"id":"w2","widget":"assigned-tasks","size":"m"},{"id":"w3","widget":"approvals","size":"m"},{"id":"w4","widget":"dev-tools","size":"full"},{"id":"w5","widget":"announcements","size":"full"}]'::jsonb),
  ('Office admin', 'Organisation snapshot, approvals, announcements and assigned tasks.', 'Administration',
   '[{"id":"w1","widget":"org-snapshot","size":"full"},{"id":"w2","widget":"approvals","size":"m"},{"id":"w3","widget":"assigned-tasks","size":"m"},{"id":"w4","widget":"announcements","size":"full"}]'::jsonb),
  ('New joiner', 'A calm first screen: announcements, my tasks and work, and KPI goals once assigned.', 'General',
   '[{"id":"w1","widget":"announcements","size":"full"},{"id":"w2","widget":"assigned-tasks","size":"m"},{"id":"w3","widget":"approvals","size":"m"},{"id":"w4","widget":"my-work","size":"full"},{"id":"w5","widget":"kpi-scorecard","size":"full"}]'::jsonb)
)
INSERT INTO public.dashboards (org_id, name, description, category, status, layout, published_layout, version, created_by, updated_by)
SELECT NULL, t.name, t.description, t.category, 'published', t.layout, t.layout, 1, NULL, NULL
  FROM t
 WHERE NOT EXISTS (SELECT 1 FROM public.dashboards d WHERE d.org_id IS NULL AND d.name = t.name);

INSERT INTO public.dashboard_versions (dashboard_id, org_id, version, layout, note, published_by)
SELECT id, NULL, 1, layout, 'Starter template', NULL FROM public.dashboards
 WHERE org_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.dashboard_versions v WHERE v.dashboard_id = dashboards.id);

COMMIT;
