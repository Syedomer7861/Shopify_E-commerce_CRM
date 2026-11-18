-- Live updates for the field pages: broadcast changes to visits, live
-- locations and field contacts through Supabase Realtime. Realtime checks each
-- subscriber's SELECT policy, so nobody receives rows they cannot read.
-- Safe to run twice.
do $$
declare t text;
begin
  foreach t in array array['visits', 'field_live_locations', 'field_contacts'] loop
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
