-- Egress / storage smoke alarm.
--
-- The app runs on the Supabase Free plan (500 MB DB, 5 GB/mo egress). Egress
-- itself is a platform metric and can't be read from SQL, so this tracks the
-- next best thing: a daily snapshot of DB size and the 15 largest tables. A
-- table that suddenly balloons is almost always the thing burning egress too
-- (a log table with no retention, an unbounded sync trail). The cron at
-- /api/cron/egress-watch reads a snapshot, compares to the previous one, and
-- notifies admins when the DB nears the plan wall or a single table jumps.

create table if not exists public.egress_watch (
  id          uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  db_bytes    bigint not null,
  table_sizes jsonb  not null default '[]'::jsonb,
  note        text
);

create index if not exists egress_watch_captured_at_idx
  on public.egress_watch (captured_at desc);

alter table public.egress_watch enable row level security;

drop policy if exists egress_watch_admin_read on public.egress_watch;
create policy egress_watch_admin_read on public.egress_watch
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
-- Writes only ever come from the cron via the service-role client, which
-- bypasses RLS; no INSERT/UPDATE/DELETE policy is intentional.

-- Snapshot helper. SECURITY DEFINER so it can read pg_catalog sizes; locked
-- to the service_role that the cron uses.
create or replace function public.db_size_stats()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'tables', coalesce((
      select jsonb_agg(t order by t.bytes desc)
      from (
        select c.relname as name,
               pg_total_relation_size(c.oid) as bytes
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p')
        order by pg_total_relation_size(c.oid) desc
        limit 15
      ) t
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.db_size_stats() from public;
grant execute on function public.db_size_stats() to service_role;
