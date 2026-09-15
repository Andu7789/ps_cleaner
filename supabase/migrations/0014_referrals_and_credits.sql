-- Growth tier: referral scheme + loyalty/credit system, sharing one
-- generic credit ledger rather than two separate one-off mechanisms — a
-- referral bonus and a loyalty reward are both just "a credit this
-- customer can spend on a future booking," so they're the same table with
-- a different `reason`, which also leaves room for a future
-- cancellation-fee-as-negative-credit without another new table.
alter table "PS_CLEAN_customers"
  add column referral_code text unique,
  add column referred_by_customer_id uuid references "PS_CLEAN_customers"(id) on delete set null;

create table "PS_CLEAN_customer_credits" (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references "PS_CLEAN_customers"(id) on delete cascade,
  -- Positive = credit earned; negative = spent/redeemed. A running sum of
  -- this column is the customer's balance — no separate balance column to
  -- keep in sync.
  amount_pence integer not null,
  reason text not null check (reason in ('referral_bonus', 'referred_signup_bonus', 'loyalty_reward', 'redeemed')),
  related_booking_id uuid references "PS_CLEAN_bookings"(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_ps_clean_customer_credits_customer on "PS_CLEAN_customer_credits"(customer_id);

alter table "PS_CLEAN_customer_credits" enable row level security;

create policy "customer_credits read own" on "PS_CLEAN_customer_credits"
  for select using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin()
  );
-- No direct write policy for customers — every row is written by the
-- SECURITY DEFINER functions in 0015, same "RPC is the only write path"
-- pattern as bookings and reviews.
create policy "customer_credits admin write" on "PS_CLEAN_customer_credits"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());
