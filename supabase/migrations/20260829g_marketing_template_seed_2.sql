-- ============================================================
-- Workspace — more starter templates (Ads, Marketplace/Amazon ops,
-- general ops). Depends on 20260829c (mkt_templates). Re-runnable: each
-- INSERT is skipped if a template of that name already exists.
--
-- payload shape:
--   kind='list'  { color, icon, statuses:[{id,name,color,type}], tasks:[{title,priority?,status?,tags?}] }
--   kind='task'  { tasks:[{title,priority?,tags?,description?}] }
-- ============================================================

-- ---------- LIST templates ----------

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'Ad campaign setup', 'list', '{
  "color": "#f43f5e", "icon": "target",
  "statuses": [
    {"id":"brief","name":"Brief","color":"#8b8b8b","type":"not_started"},
    {"id":"build","name":"Build","color":"#3b82f6","type":"active"},
    {"id":"qa","name":"QA","color":"#f59e0b","type":"active"},
    {"id":"live","name":"Live","color":"#22c55e","type":"active"},
    {"id":"optimizing","name":"Optimizing","color":"#a855f7","type":"active"},
    {"id":"wrapped","name":"Wrapped","color":"#10b981","type":"done"}
  ],
  "tasks": [
    {"title":"Campaign brief + budget + goal (ROAS/CPA)","status":"brief","priority":"high"},
    {"title":"Audience + targeting plan","status":"brief"},
    {"title":"Write ad copy variants (3-5)","status":"build"},
    {"title":"Creative assets — static + video","status":"build"},
    {"title":"Tracking: UTMs, pixel, conversions","status":"build","tags":["tracking"]},
    {"title":"Landing page check — speed, message match","status":"qa"},
    {"title":"Pre-launch QA checklist","status":"qa","tags":["qa"]},
    {"title":"Launch","status":"live","priority":"high"},
    {"title":"Day 1 / 3 / 7 optimization passes","status":"optimizing"},
    {"title":"Final performance report","status":"wrapped"}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'Ad campaign setup');

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'Amazon listing launch', 'list', '{
  "color": "#f59e0b", "icon": "shopping-cart",
  "statuses": [
    {"id":"prep","name":"Prep","color":"#8b8b8b","type":"not_started"},
    {"id":"content","name":"Content","color":"#3b82f6","type":"active"},
    {"id":"review","name":"Review","color":"#f59e0b","type":"active"},
    {"id":"live","name":"Live","color":"#22c55e","type":"active"},
    {"id":"monitoring","name":"Monitoring","color":"#10b981","type":"done"}
  ],
  "tasks": [
    {"title":"Keyword + competitor research","status":"prep","priority":"high","tags":["research"]},
    {"title":"Title, bullets, description","status":"content"},
    {"title":"A+ / EBC content","status":"content"},
    {"title":"Main + gallery images, video","status":"content"},
    {"title":"Backend search terms","status":"content","tags":["seo"]},
    {"title":"Pricing + buy-box plan","status":"prep"},
    {"title":"FBA shipment / inventory in place","status":"review","priority":"high"},
    {"title":"Listing QA — compliance, variations, category","status":"review","tags":["qa"]},
    {"title":"Launch PPC campaign","status":"live"},
    {"title":"Review-request flow set up","status":"live"},
    {"title":"Week-1 metrics review (sessions, CVR, ACoS)","status":"monitoring"}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'Amazon listing launch');

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'New SKU onboarding', 'list', '{
  "color": "#14b8a6", "icon": "package",
  "statuses": [
    {"id":"intake","name":"Intake","color":"#8b8b8b","type":"not_started"},
    {"id":"setup","name":"Setup","color":"#3b82f6","type":"active"},
    {"id":"content","name":"Content","color":"#a855f7","type":"active"},
    {"id":"qa","name":"QA","color":"#f59e0b","type":"active"},
    {"id":"live","name":"Live","color":"#10b981","type":"done"}
  ],
  "tasks": [
    {"title":"Product data + specs + variants","status":"intake","priority":"high"},
    {"title":"Cost, margin, pricing across channels","status":"setup"},
    {"title":"Create listing on each channel (site, Amazon, ...)","status":"setup"},
    {"title":"Photography","status":"content"},
    {"title":"Copywriting","status":"content"},
    {"title":"Compliance, labels, safety docs","status":"qa","tags":["compliance"]},
    {"title":"Inventory forecast + first PO","status":"setup"},
    {"title":"Go-live checklist","status":"qa","priority":"high"}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'New SKU onboarding');

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'Social content week', 'list', '{
  "color": "#8b5cf6", "icon": "instagram",
  "statuses": [
    {"id":"idea","name":"Idea","color":"#8b8b8b","type":"not_started"},
    {"id":"draft","name":"Draft","color":"#3b82f6","type":"active"},
    {"id":"design","name":"Design","color":"#a855f7","type":"active"},
    {"id":"scheduled","name":"Scheduled","color":"#14b8a6","type":"active"},
    {"id":"posted","name":"Posted","color":"#10b981","type":"done"}
  ],
  "tasks": [
    {"title":"Post 1","status":"idea"},
    {"title":"Post 2","status":"idea"},
    {"title":"Post 3","status":"idea"},
    {"title":"Story set (2)","status":"idea"},
    {"title":"Reel / short (1)","status":"idea"},
    {"title":"Caption + hashtag pass","status":"draft"},
    {"title":"Schedule everything","status":"scheduled"}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'Social content week');

-- ---------- TASK-BUNDLE templates ----------

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'Marketplace weekly ops', 'task', '{
  "tasks": [
    {"title":"Inventory levels + restock alerts","priority":"high","tags":["inventory"]},
    {"title":"Buy-box status check","tags":["amazon"]},
    {"title":"PPC spend + ACoS review","tags":["ads"]},
    {"title":"Answer reviews + customer questions","tags":["cx"]},
    {"title":"Process returns / A-to-z cases","tags":["cx"]},
    {"title":"Competitor price + listing scan","tags":["research"]}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'Marketplace weekly ops');

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'Weekly ads review', 'task', '{
  "tasks": [
    {"title":"Spend vs budget for the week","priority":"high"},
    {"title":"Top + bottom performers","tags":["ads"]},
    {"title":"Pause losers","tags":["ads"]},
    {"title":"Scale winners","tags":["ads"]},
    {"title":"Creative fatigue / refresh check","tags":["creative"]},
    {"title":"Next-week plan + budget split","tags":["planning"]}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'Weekly ads review');

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'Daily ops checklist', 'task', '{
  "tasks": [
    {"title":"Check dashboards + alerts","priority":"high"},
    {"title":"Triage inbox + incoming requests"},
    {"title":"Standup notes / blockers"},
    {"title":"Update the task board"},
    {"title":"End-of-day summary"}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'Daily ops checklist');

INSERT INTO mkt_templates (name, kind, payload)
SELECT 'Monthly reporting', 'task', '{
  "tasks": [
    {"title":"Pull channel numbers (site, Amazon, ads, email)","priority":"high"},
    {"title":"Revenue + spend + ROAS / blended CAC"},
    {"title":"Wins / losses / learnings writeup"},
    {"title":"Next-month priorities"},
    {"title":"Share the report / deck","tags":["comms"]}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM mkt_templates WHERE name = 'Monthly reporting');
