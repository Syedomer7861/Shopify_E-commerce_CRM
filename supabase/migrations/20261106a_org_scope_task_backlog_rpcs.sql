-- The 3 task-backlog RPCs from 20260827e (orders_needing_issue_task,
-- orders_needing_review_tasks, customers_needing_winback) have no org
-- filter at all - once a 2nd org exists, each would return every tenant's
-- candidate rows mixed together, and task-generator/issue-task-generator/
-- winback-generator would create tasks assigned across org boundaries.
-- Adding a required target_org_id param (old callers must pass it - no
-- default, so a forgotten call site fails loudly instead of silently
-- scanning every org).

drop function if exists orders_needing_issue_task(int);
create or replace function orders_needing_issue_task(limit_n int, target_org_id uuid)
returns table (id uuid, customer_id uuid, total_price numeric, delivery_status text, ordered_at timestamptz)
language sql stable as $$
  select o.id, o.customer_id, o.total_price, o.delivery_status, o.ordered_at
  from orders o
  where o.delivery_status in ('rto', 'failed')
  and o.org_id = target_org_id
  and not exists (
    select 1 from tasks t
    where t.order_id = o.id
      and t.task_type = 'issue_resolution'
      and t.status not in ('done', 'cancelled', 'skipped')
  )
  order by o.id
  limit limit_n;
$$;

drop function if exists orders_needing_review_tasks(int);
create or replace function orders_needing_review_tasks(limit_n int, target_org_id uuid)
returns table (id uuid, customer_id uuid, delivered_at timestamptz, line_items jsonb, rto_flag boolean, segment text)
language sql stable as $$
  select o.id, o.customer_id, o.delivered_at, o.line_items, c.rto_flag, c.segment
  from orders o
  join customers c on c.id = o.customer_id
  where o.delivery_status in ('delivered', 'Delivered')
    and o.delivered_at is not null
    and coalesce(c.rto_flag, false) = false
    and o.org_id = target_org_id
    and not exists (
      select 1 from tasks t
      where t.order_id = o.id
        and t.task_type in ('review', 'reorder', 'final_followup')
    )
  order by o.id
  limit limit_n;
$$;

drop function if exists customers_needing_winback(int);
create or replace function customers_needing_winback(limit_n int, target_org_id uuid)
returns table (id uuid, name text, last_order_date timestamptz, segment text)
language sql stable as $$
  select c.id, c.name, c.last_order_date, c.segment
  from customers c
  where c.last_order_date is not null
    and c.last_order_date < now() - interval '60 days'
    and c.org_id = target_org_id
    and not exists (
      select 1 from tasks t
      where t.customer_id = c.id
        and t.task_type = 'win_back'
        and t.status not in ('done', 'cancelled', 'skipped')
    )
  order by c.id
  limit limit_n;
$$;
