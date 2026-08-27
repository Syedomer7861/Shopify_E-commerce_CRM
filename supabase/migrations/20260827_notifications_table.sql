-- Per-user in-app notifications (task assigned, flagged by manager, customer
-- replied, etc). Previously the only notification path was notifyAdmin() /
-- sendAdminNotification() in src/lib/notifications.ts, which only ever
-- reaches the admin - individual agents had no in-app signal and had to
-- poll pages to find out something needed attention.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  type text not null default 'info' check (type in ('info', 'success', 'warning', 'alert')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on notifications (user_id, read, created_at desc);

alter table notifications enable row level security;

-- Recipients can read and mark-read their own notifications only.
-- No insert/delete policy for authenticated - notifications are created
-- server-side via the admin client (service role bypasses RLS), same
-- lockdown pattern already used for settings/HR tables in this project.
drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own" on notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
