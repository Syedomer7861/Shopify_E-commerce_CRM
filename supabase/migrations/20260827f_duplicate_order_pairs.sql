-- Supports /api/admin/merge-duplicate-orders (one-time repair - see that
-- route's own comment, and the sync-logic.ts fix in the same commit
-- series, for the root cause). Every one of the 2,592 confirmed
-- duplicate order_number groups has exactly one "shopify"-sourced row
-- and one "shiprocket"-sourced row, so this returns exactly that pairing
-- - no guessing which row is which when there are more than two.
create or replace function duplicate_order_pairs(limit_n int)
returns table (canonical_id uuid, duplicate_id uuid, order_number text)
language sql stable as $$
  select
    (array_agg(o.id) filter (where o.source = 'shopify'))[1] as canonical_id,
    (array_agg(o.id) filter (where o.source = 'shiprocket'))[1] as duplicate_id,
    o.order_number
  from orders o
  where o.order_number in (
    select order_number from orders group by order_number having count(*) > 1
  )
  group by o.order_number
  having count(*) filter (where o.source = 'shopify') = 1
     and count(*) filter (where o.source = 'shiprocket') = 1
     and count(*) = 2
  limit limit_n;
$$;
