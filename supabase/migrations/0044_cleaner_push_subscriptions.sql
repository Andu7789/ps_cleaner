-- Browser push subscriptions for the cleaner app, so a cleaner can be told
-- straight away when a booking is made for them. One row per device.
create table if not exists "PS_CLEAN_push_subscriptions" (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references "PS_CLEAN_businesses"(id) on delete cascade,
  cleaner_id uuid not null references "PS_CLEAN_cleaners"(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists ps_clean_push_subscriptions_cleaner_idx
  on "PS_CLEAN_push_subscriptions" (cleaner_id);

-- Only the server (service role) reads or writes these, so RLS is on with no
-- policies: nothing is reachable from the browser directly.
alter table "PS_CLEAN_push_subscriptions" enable row level security;
