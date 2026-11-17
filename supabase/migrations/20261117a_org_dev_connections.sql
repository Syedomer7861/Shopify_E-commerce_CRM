-- Per-organisation developer tool connections (GitHub, Vercel, Supabase) for
-- the live developer dashboard.
--
-- Holds access tokens, so it is server-only, exactly like
-- org_google_connections: RLS on with NO policies and no grants to
-- anon/authenticated. Only the service role (API routes after their own
-- admin + org checks) reads or writes it; tokens never reach a browser and
-- one org can never see another's row.
-- Additive only: no existing table or data changes.

create table if not exists public.org_dev_connections (
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('github', 'vercel', 'supabase')),
  token text not null,
  -- Non-secret settings: GitHub repos ["owner/name"], Vercel team id, Supabase project refs, account label.
  config jsonb not null default '{}'::jsonb,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_status text,
  primary key (org_id, provider)
);

alter table public.org_dev_connections enable row level security;
revoke all on public.org_dev_connections from anon, authenticated;
