-- issue-task-generator and winback-generator (split out of task-generator,
-- see that route's comment) queried their source tables with .limit(N) and
-- no ORDER BY, then skipped rows that already had the task inside the
-- loop. Confirmed live: with a 15,956-row candidate pool for
-- issue_resolution alone, repeated calls kept re-scanning the same
-- unordered page and made zero real progress toward the 345 orders that
-- actually needed the task. These RPCs push the "does this order/customer
-- already have the task" check into SQL (NOT EXISTS, ordered by id) so
-- every call is guaranteed to return genuinely new candidates until the
-- real backlog is exhausted, without ever pulling the full multi-thousand
-- row pool into the app.

create or replace function orders_needing_issue_task(limit_n int)
returns table (id uuid, customer_id uuid, total_price numeric, delivery_status text, ordered_at timestamptz)
language sql stable as $$
  -- The in_transit-stale branch is disabled for now: 15,366 orders are
  -- stuck at delivery_status = 'in_transit', some dated back to Feb 2025 -
  -- almost certainly a Shiprocket sync staleness bug (they likely
  -- delivered or failed long ago and never got updated), not 15k genuine
  -- live shipping problems. Enabling it as-is would flood every agent's
  -- queue with mostly-stale noise. Re-enable
  -- (`or (o.delivery_status = 'in_transit' and o.ordered_at <= now() -
  -- interval '7 days')`) once that staleness is investigated separately.
  select o.id, o.customer_id, o.total_price, o.delivery_status, o.ordered_at
  from orders o
  where o.delivery_status in ('rto', 'failed')
  and not exists (
    select 1 from tasks t
    where t.order_id = o.id
      and t.task_type = 'issue_resolution'
      and t.status not in ('done', 'cancelled', 'skipped')
  )
  order by o.id
  limit limit_n;
$$;

-- Same fix, same reasoning, for task-generator's own order loop (review/
-- reorder/final_followup) - its .limit(N) had no ordering either. Its
-- current real backlog happens to be tiny, so this wasn't urgent the way
-- the other two were, but the same silent-non-progress bug applies.
create or replace function orders_needing_review_tasks(limit_n int)
returns table (id uuid, customer_id uuid, delivered_at timestamptz, line_items jsonb, rto_flag boolean, segment text)
language sql stable as $$
  select o.id, o.customer_id, o.delivered_at, o.line_items, c.rto_flag, c.segment
  from orders o
  join customers c on c.id = o.customer_id
  where o.delivery_status in ('delivered', 'Delivered')
    and o.delivered_at is not null
    and coalesce(c.rto_flag, false) = false
    and not exists (
      select 1 from tasks t
      where t.order_id = o.id
        and t.task_type in ('review', 'reorder', 'final_followup')
    )
  order by o.id
  limit limit_n;
$$;

create or replace function customers_needing_winback(limit_n int)
returns table (id uuid, name text, last_order_date timestamptz, segment text)
language sql stable as $$
  select c.id, c.name, c.last_order_date, c.segment
  from customers c
  where c.last_order_date is not null
    and c.last_order_date < now() - interval '60 days'
    and not exists (
      select 1 from tasks t
      where t.customer_id = c.id
        and t.task_type = 'win_back'
        and t.status not in ('done', 'cancelled', 'skipped')
    )
  order by c.id
  limit limit_n;
$$;
