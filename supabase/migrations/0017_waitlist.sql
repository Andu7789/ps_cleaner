-- Growth tier: waitlist / cancellation-fill notifications. A customer who
-- finds no availability for a service on a given day can ask to be
-- notified if a slot opens up — checked (app-side, not a DB trigger,
-- since notifying needs to call out to email/SMS, which lives in the
-- Next.js app, not Postgres) whenever a booking on that day gets
-- cancelled, from whichever of the three cancellation paths did it
-- (customer, admin, or system — see lib/bookings.ts and
-- cancelBookingAction).
create table "PS_CLEAN_waitlist_entries" (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references "PS_CLEAN_customers"(id) on delete cascade,
  service_id uuid not null references "PS_CLEAN_services"(id) on delete cascade,
  -- null = any cleaner qualified for this service, not just one specific person.
  cleaner_id uuid references "PS_CLEAN_cleaners"(id) on delete cascade,
  wanted_date date not null,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_ps_clean_waitlist_lookup on "PS_CLEAN_waitlist_entries"(service_id, wanted_date) where notified_at is null;
create index idx_ps_clean_waitlist_customer on "PS_CLEAN_waitlist_entries"(customer_id);

alter table "PS_CLEAN_waitlist_entries" enable row level security;

create policy "waitlist read own" on "PS_CLEAN_waitlist_entries"
  for select using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin()
  );
-- A customer can join the waitlist directly (unlike bookings/reviews,
-- there's no cross-table validation needed beyond "is this your own
-- customer_id" — RLS alone is enough here, no RPC required).
create policy "waitlist insert own" on "PS_CLEAN_waitlist_entries"
  for insert with check (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
  );
create policy "waitlist delete own" on "PS_CLEAN_waitlist_entries"
  for delete using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin()
  );
create policy "waitlist admin all" on "PS_CLEAN_waitlist_entries"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());
