-- Real per-agent revenue attribution, replacing the old
-- agent_activity_logs.metadata.revenue mechanism (which credited an
-- order's FULL value again on every task closed against it - an order
-- with a review-call task and a reorder-call task, closed by the same
-- or different agents, counted twice).
--
-- order_id as PRIMARY KEY is the actual fix: at most one attribution
-- row can ever exist per order, enforced by the database, not by
-- application discipline. First revenue-eligible task closed on an
-- order claims it; every later completion on the same order (any
-- agent, any task type) is a no-op (see attributeOrderRevenue in
-- src/lib/revenue-attribution.ts).
--
-- No FK constraints on order_id/agent_id/task_id - deliberate. This
-- session already merged/deleted thousands of duplicate order rows;
-- a strict FK would make this table (and its backfill below) fragile
-- against exactly the kind of order-id churn this app has. Uniqueness
-- (the real invariant) comes from the primary key, not a foreign key.
create table if not exists order_revenue_attribution (
  order_id uuid primary key,
  agent_id uuid,
  task_id uuid,
  task_type text not null,
  amount numeric not null default 0,
  attributed_at timestamptz not null default now()
);

create index if not exists idx_order_revenue_attribution_agent
  on order_revenue_attribution (agent_id, attributed_at);

-- Backfill from history: for every order whose earliest revenue-eligible
-- task completion (recovery/reorder/win_back - the task types that
-- plausibly drove the sale, not routine follow-ups) is still on a real,
-- currently-existing order, attribute it to whichever agent closed that
-- task first. Not a perfect reconstruction of "who really drove it" for
-- orders that had several eligible completions, but a real, defensible,
-- single claim per order - a strict improvement over the old
-- every-completion-counts-again mechanism, and keeps historical date
-- ranges from silently dropping to zero revenue.
insert into order_revenue_attribution (order_id, agent_id, task_id, task_type, amount, attributed_at)
select distinct on (order_id)
  order_id, agent_id, task_id, task_type, amount, attributed_at
from (
  select
    (metadata->>'order_id')::uuid as order_id,
    agent_id,
    (metadata->>'task_id')::uuid as task_id,
    metadata->>'task_type' as task_type,
    coalesce((metadata->>'revenue')::numeric, 0) as amount,
    created_at as attributed_at
  from agent_activity_logs
  where activity_type in ('task_completion', 'task_completed')
    and metadata->>'order_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and metadata->>'task_type' in ('recovery', 'reorder', 'win_back')
    and coalesce((metadata->>'revenue')::numeric, 0) > 0
    and agent_id is not null
) eligible
where exists (select 1 from orders o where o.id = eligible.order_id)
order by order_id, attributed_at asc
on conflict (order_id) do nothing;
