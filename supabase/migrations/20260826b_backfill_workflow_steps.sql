-- Workflows created before the API fix in this commit were saved into the
-- legacy workflows.actions JSONB column, which WorkflowEngine never reads
-- (it only reads workflow_steps). Without this backfill, every existing
-- workflow would silently lose its configured actions the moment the fixed
-- API starts reading workflow_steps instead. Only touches workflows that
-- have actions but no steps yet, so it's safe to run more than once.
INSERT INTO workflow_steps (workflow_id, step_order, type, params)
SELECT
  w.id,
  elem.ord,
  CASE (elem.value->>'type')
    WHEN 'create_task' THEN 'task'
    ELSE elem.value->>'type'
  END,
  COALESCE(elem.value->'params', '{}'::jsonb)
FROM workflows w
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.actions, '[]'::jsonb)) WITH ORDINALITY AS elem(value, ord)
WHERE jsonb_typeof(w.actions) = 'array'
  AND jsonb_array_length(w.actions) > 0
  AND NOT EXISTS (SELECT 1 FROM workflow_steps s WHERE s.workflow_id = w.id);
