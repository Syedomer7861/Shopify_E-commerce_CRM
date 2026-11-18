-- Field contacts: every shop, clinic, distributor or person the offline team
-- visits, with contact details for sales follow-up and marketing. Visits link
-- to a contact; the contact's visit count, last visit and map location are
-- kept up to date from its visits.
--
-- Permissions: new module 'field_contacts' (view/create/edit/delete/export).
-- Existing roles get the same reach they have on Field Visits; the role
-- named 'marketing' gets view + export for everyone (the data is for them).
-- Admins can change any of it on the Roles page.

create table if not exists public.field_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null default auth.uid(),
  business_name text not null check (char_length(btrim(business_name)) between 1 and 200),
  category text check (category is null or char_length(category) <= 60),
  contact_person text check (contact_person is null or char_length(contact_person) <= 120),
  designation text check (designation is null or char_length(designation) <= 80),
  phone text check (phone is null or phone ~ '^[0-9]{7,15}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{7,15}$'),
  email text check (email is null or (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  address text check (address is null or char_length(address) <= 500),
  area text check (area is null or char_length(area) <= 120),
  city text check (city is null or char_length(city) <= 80),
  state text check (state is null or char_length(state) <= 80),
  pincode text check (pincode is null or pincode ~ '^[A-Za-z0-9 -]{3,10}$'),
  lat numeric(9,6) check (lat is null or lat between -90 and 90),
  lng numeric(9,6) check (lng is null or lng between -180 and 180),
  interest text check (interest is null or interest in ('hot', 'warm', 'cold')),
  products_interest text check (products_interest is null or char_length(products_interest) <= 300),
  notes text check (notes is null or char_length(notes) <= 2000),
  -- 'yes' only when the contact agreed to receive offers (WhatsApp/SMS/email).
  marketing_consent text not null default 'no' check (marketing_consent in ('yes', 'no')),
  consent_at timestamptz,
  status text not null default 'active' check (status in ('active', 'customer', 'not_interested', 'closed')),
  visit_count integer not null default 0,
  last_visit_at timestamptz,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One contact per phone number per org, so repeat visits land on the same record.
create unique index if not exists field_contacts_org_phone on public.field_contacts (org_id, phone) where phone is not null;
create index if not exists field_contacts_org_created on public.field_contacts (org_id, created_at desc);
create index if not exists field_contacts_owner on public.field_contacts (owner_id);

alter table public.visits add column if not exists contact_id uuid references public.field_contacts(id) on delete set null;
create index if not exists visits_contact on public.visits (contact_id) where contact_id is not null;

-- updated_at, and consent_at stamped when consent turns to 'yes'.
create or replace function public.field_contacts_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- Same phone rule as the app (src/lib/phone-utils.ts): digits only, last 10.
  new.phone := nullif(right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10), '');
  new.whatsapp := nullif(right(regexp_replace(coalesce(new.whatsapp, ''), '\D', '', 'g'), 10), '');
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  if new.marketing_consent = 'yes' and (tg_op = 'INSERT' or old.marketing_consent is distinct from 'yes') then
    new.consent_at := now();
  elsif new.marketing_consent = 'no' then
    new.consent_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_field_contacts_touch on public.field_contacts;
create trigger trg_field_contacts_touch before insert or update on public.field_contacts
  for each row execute function public.field_contacts_touch();

-- Visit count, last visit and (first) map location follow the contact's visits.
-- Security definer: a rep can link a visit to a contact another rep added.
create or replace function public.field_contacts_from_visits() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  ids := array_remove(array[
    case when tg_op <> 'DELETE' then new.contact_id end,
    case when tg_op <> 'INSERT' then old.contact_id end
  ], null);
  update public.field_contacts c set
    visit_count = s.n,
    last_visit_at = s.last_at,
    lat = coalesce(c.lat, s.lat),
    lng = coalesce(c.lng, s.lng)
  from (
    select v.contact_id, count(*)::int as n,
      max(coalesce(v.check_in_at, v.planned_at)) filter (where v.status <> 'cancelled') as last_at,
      (array_agg(v.check_in_lat order by v.check_in_at) filter (where v.check_in_lat is not null))[1] as lat,
      (array_agg(v.check_in_lng order by v.check_in_at) filter (where v.check_in_lng is not null))[1] as lng
    from public.visits v where v.contact_id = any(ids) group by v.contact_id
  ) s
  where c.id = s.contact_id;
  -- A contact whose last visit was unlinked or deleted.
  update public.field_contacts c set visit_count = 0, last_visit_at = null
  where c.id = any(ids) and not exists (select 1 from public.visits v where v.contact_id = c.id);
  return null;
end $$;
drop trigger if exists trg_visits_field_contact on public.visits;
create trigger trg_visits_field_contact
  after insert or delete or update of contact_id, status, check_in_at, check_in_lat, planned_at on public.visits
  for each row execute function public.field_contacts_from_visits();

-- Find an existing contact by phone before adding a duplicate. Returns only
-- the id and business name, so a rep can link a visit to a contact they
-- can't otherwise see without reading its details.
create or replace function public.field_contact_by_phone(p_phone text)
returns table (id uuid, business_name text)
language sql stable security definer set search_path = public as $$
  select c.id, c.business_name from public.field_contacts c
  where c.org_id = public.current_org_id() and c.phone = p_phone
    and (public.has_perm('visits', 'create') or public.has_perm('field_contacts', 'create'))
  limit 1;
$$;
revoke all on function public.field_contact_by_phone(text) from public, anon;
grant execute on function public.field_contact_by_phone(text) to authenticated;

alter table public.field_contacts enable row level security;

drop policy if exists field_contacts_read on public.field_contacts;
create policy field_contacts_read on public.field_contacts for select using (
  org_id = public.current_org_id() and (
    public.can_reach('field_contacts', 'view', owner_id)
    -- the rep who visited it sees the contact they visited
    or exists (select 1 from public.visits v where v.contact_id = field_contacts.id and v.owner_id = auth.uid())
  )
);
drop policy if exists field_contacts_insert on public.field_contacts;
create policy field_contacts_insert on public.field_contacts for insert with check (
  org_id = public.current_org_id() and owner_id = auth.uid()
  and (public.has_perm('field_contacts', 'create') or public.has_perm('visits', 'create'))
);
drop policy if exists field_contacts_update on public.field_contacts;
create policy field_contacts_update on public.field_contacts for update
  using (org_id = public.current_org_id() and public.can_reach('field_contacts', 'edit', owner_id))
  with check (org_id = public.current_org_id() and public.can_reach('field_contacts', 'edit', owner_id));
drop policy if exists field_contacts_delete on public.field_contacts;
create policy field_contacts_delete on public.field_contacts for delete
  using (org_id = public.current_org_id() and public.can_reach('field_contacts', 'delete', owner_id));

grant select, insert, update, delete on public.field_contacts to authenticated;

-- Grants: same reach as Field Visits; Marketing sees and exports everyone.
update public.roles r set grants = jsonb_set(
  coalesce(r.grants, '{}'::jsonb), '{field_contacts}',
  case when r.name = 'marketing' then jsonb_build_object(
      'view', 'organisation', 'export', 'organisation',
      'create', coalesce(r.grants->'visits'->>'create', 'own'), 'edit', coalesce(r.grants->'visits'->>'edit', 'own'))
    else jsonb_strip_nulls(jsonb_build_object(
      'view', r.grants->'visits'->>'view', 'create', r.grants->'visits'->>'create',
      'edit', r.grants->'visits'->>'edit',
      'export', case when r.grants->'visits'->>'view' in ('team', 'department', 'branch', 'organisation') then r.grants->'visits'->>'view' end))
  end)
where r.grants ? 'visits' and not (r.grants ? 'field_contacts');
