-- ============================================================
-- Marketing workspace — seed starter templates.
--
-- Depends on 20260829c_marketing_workspace.sql (mkt_templates table).
-- Re-runnable: each INSERT is skipped if a template of that name exists.
--
-- payload shape:
--   kind='list'  { color, icon, statuses:[{id,name,color,type}], tasks:[{title,priority?,status?,tags?}] }
--   kind='task'  { tasks:[{title,priority?,tags?,description?}] }
-- ============================================================

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'Blog post', 'list', '{
  "color": "#6366f1", "icon": "file-text",
  "statuses": [
    {"id":"idea","name":"Idea","color":"#8b8b8b","type":"not_started"},
    {"id":"drafting","name":"Drafting","color":"#3b82f6","type":"active"},
    {"id":"editing","name":"Editing","color":"#f59e0b","type":"active"},
    {"id":"seo","name":"SEO","color":"#a855f7","type":"active"},
    {"id":"scheduled","name":"Scheduled","color":"#14b8a6","type":"active"},
    {"id":"published","name":"Published","color":"#10b981","type":"done"}
  ],
  "tasks": [
    {"title":"Keyword + topic research","status":"idea","priority":"high","tags":["research"]},
    {"title":"Outline the post","status":"idea"},
    {"title":"Write first draft","status":"drafting"},
    {"title":"Line + copy edit","status":"editing"},
    {"title":"SEO pass — title, meta, internal links","status":"seo","tags":["seo"]},
    {"title":"Source / create images","status":"editing"},
    {"title":"Schedule + queue social","status":"scheduled"}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'Blog post');

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'Campaign launch', 'list', '{
  "color": "#f59e0b", "icon": "megaphone",
  "statuses": [
    {"id":"brief","name":"Brief","color":"#8b8b8b","type":"not_started"},
    {"id":"assets","name":"Assets","color":"#3b82f6","type":"active"},
    {"id":"review","name":"Review","color":"#f59e0b","type":"active"},
    {"id":"scheduled","name":"Scheduled","color":"#14b8a6","type":"active"},
    {"id":"live","name":"Live","color":"#22c55e","type":"active"},
    {"id":"wrap","name":"Wrap-up","color":"#10b981","type":"done"}
  ],
  "tasks": [
    {"title":"Write campaign brief + goals","status":"brief","priority":"high"},
    {"title":"Draft messaging + copy","status":"assets"},
    {"title":"Design creatives","status":"assets"},
    {"title":"Build / update landing page","status":"assets"},
    {"title":"QA links, tracking, UTMs","status":"review","tags":["qa"]},
    {"title":"Schedule email + WhatsApp sends","status":"scheduled"},
    {"title":"Monitor day-1 performance","status":"live"},
    {"title":"Post-campaign retro + numbers","status":"wrap"}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'Campaign launch');

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'Product launch', 'list', '{
  "color": "#ec4899", "icon": "rocket",
  "statuses": [
    {"id":"planning","name":"Planning","color":"#8b8b8b","type":"not_started"},
    {"id":"in_progress","name":"In Progress","color":"#3b82f6","type":"active"},
    {"id":"review","name":"Review","color":"#f59e0b","type":"active"},
    {"id":"ready","name":"Ready","color":"#14b8a6","type":"active"},
    {"id":"launched","name":"Launched","color":"#10b981","type":"done"}
  ],
  "tasks": [
    {"title":"Launch plan + timeline","status":"planning","priority":"urgent"},
    {"title":"Positioning + key messages","status":"planning"},
    {"title":"Email announcement sequence","status":"in_progress"},
    {"title":"Social teasers + launch posts","status":"in_progress"},
    {"title":"Product page copy + images","status":"in_progress"},
    {"title":"Influencer / partner outreach","status":"in_progress"},
    {"title":"Launch-day checklist","status":"review","priority":"high"},
    {"title":"Post-launch performance report","status":"planning"}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'Product launch');

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'Weekly content sprint', 'task', '{
  "tasks": [
    {"title":"Newsletter issue","priority":"high","tags":["email"]},
    {"title":"3x Instagram posts","tags":["social"]},
    {"title":"2x LinkedIn posts","tags":["social"]},
    {"title":"1x short-form video","tags":["video"]},
    {"title":"Repurpose top post into a thread","tags":["social"]}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'Weekly content sprint');
