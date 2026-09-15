-- Growth tier: cleaner payout tracking. Not a payment-processing feature
-- (no money actually moves to cleaners here, e.g. via Stripe Connect —
-- that's a materially bigger feature, out of scope) — this is exactly
-- what the roadmap asked for: a record of hours/jobs completed per
-- cleaner per period, so the business owner has an audit trail of what's
-- been paid out and for what, however they actually pay their cleaners
-- (bank transfer, cash, whatever).
create table "PS_CLEAN_cleaner_payouts" (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references "PS_CLEAN_cleaners"(id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  booking_count integer not null check (booking_count >= 0),
  total_minutes integer not null check (total_minutes >= 0),
  total_revenue_pence integer not null check (total_revenue_pence >= 0),
  notes text,
  paid_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payout_valid_period check (period_end > period_start)
);

create index idx_ps_clean_cleaner_payouts_cleaner on "PS_CLEAN_cleaner_payouts"(cleaner_id);

alter table "PS_CLEAN_cleaner_payouts" enable row level security;

-- Admin-only end to end — this is internal business/payroll data, not
-- something a cleaner (who isn't even necessarily a logged-in user in
-- Core scope — see DECISIONS.md #3) has any access path to see.
create policy "cleaner_payouts admin only" on "PS_CLEAN_cleaner_payouts"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());
