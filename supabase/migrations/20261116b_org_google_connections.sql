-- Per-organisation Google Drive & Sheets connection (weekly backups to the
-- org's own Drive, live rows to a sheet in the org's own Drive).
--
-- Holds an OAuth refresh token, so it is server-only: RLS on with NO
-- policies and no grants to anon/authenticated. Only the service role (API
-- routes after their own admin + org checks) reads or writes it; the token
-- never reaches a browser and one org can never see another's row.
-- Additive only: no existing table or data changes.

create table if not exists public.org_google_connections (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  refresh_token text not null,
  email text,
  sheet_id text,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_backup_at timestamptz,
  last_backup_status text
);

alter table public.org_google_connections enable row level security;
revoke all on public.org_google_connections from anon, authenticated;
