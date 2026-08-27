-- Web Push subscriptions (Notifications API), one row per browser/device
-- an agent has opted in from. Lets notifyUser() (see
-- src/lib/notifications.ts) also deliver a real OS-level push even when
-- the CRM tab/app is closed, not just the in-app bell.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- An agent manages only their own subscriptions (subscribe/unsubscribe
-- from their own devices). No update policy - a subscription is
-- replaced (delete + insert), never edited in place. Sending push
-- happens server-side via the admin client, which bypasses RLS.
drop policy if exists "push_subscriptions_select_own" on push_subscriptions;
create policy "push_subscriptions_select_own" on push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on push_subscriptions;
create policy "push_subscriptions_insert_own" on push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_delete_own" on push_subscriptions;
create policy "push_subscriptions_delete_own" on push_subscriptions
  for delete using (auth.uid() = user_id);
