-- Growth tier: recurring/regular bookings with auto-rebooking. A recurring
-- series is its own row; the actual jobs are still ordinary
-- PS_CLEAN_bookings rows (generated ahead of time by a cron job — see
-- /api/cron/generate-recurring-bookings) so the EXCLUDE constraint and
-- every existing conflict-checking/payment/cancellation path applies to
-- them completely unchanged. This table is just "what to generate next
-- and when," not a parallel booking system.
create table "PS_CLEAN_recurring_bookings" (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references "PS_CLEAN_customers"(id) on delete cascade,
  cleaner_id uuid not null references "PS_CLEAN_cleaners"(id) on delete restrict,
  service_id uuid not null references "PS_CLEAN_services"(id) on delete restrict,
  address_id uuid not null references "PS_CLEAN_customer_addresses"(id) on delete restrict,
  frequency text not null check (frequency in ('weekly', 'fortnightly', 'monthly')),
  -- Local wall-clock time of day the job starts, combined with
  -- next_occurrence_date (a date) at generation time — same
  -- store-local-interpret-at-query-time approach as working hours (see
  -- DECISIONS.md #5), since "every Tuesday at 9am" must stay 9am local
  -- across the BST/GMT boundary, not drift by an hour.
  time_of_day time not null,
  next_occurrence_date date not null,
  is_active boolean not null default true,
  last_generation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ps_clean_recurring_due on "PS_CLEAN_recurring_bookings"(next_occurrence_date) where is_active;
create index idx_ps_clean_recurring_customer on "PS_CLEAN_recurring_bookings"(customer_id);

alter table "PS_CLEAN_bookings"
  add column recurring_booking_id uuid references "PS_CLEAN_recurring_bookings"(id) on delete set null;

alter table "PS_CLEAN_recurring_bookings" enable row level security;

create policy "recurring_bookings read own" on "PS_CLEAN_recurring_bookings"
  for select using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin()
  );
-- Pausing/cancelling a series is a simple flag flip a customer can do
-- directly (unlike creating one, which needs to derive its anchor from a
-- real existing booking — see ps_clean_create_recurring_booking in 0019).
create policy "recurring_bookings update own" on "PS_CLEAN_recurring_bookings"
  for update using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin()
  )
  with check (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin()
  );
create policy "recurring_bookings admin all" on "PS_CLEAN_recurring_bookings"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());
