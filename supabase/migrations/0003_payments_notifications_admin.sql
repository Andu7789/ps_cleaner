-- PS Cleaning: payments, notification log, and admin users.

create table "PS_CLEAN_payments" (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references "PS_CLEAN_bookings"(id) on delete cascade,
  stripe_payment_intent_id text unique,
  -- 'deposit'/'full' happen at booking time; 'balance' is the off-session
  -- charge for the remainder closer to the job date; 'refund' and
  -- 'cancellation_fee' cover the two ways a payment can run in reverse.
  type text not null check (type in ('deposit', 'full', 'balance', 'refund', 'cancellation_fee')),
  amount_pence integer not null check (amount_pence >= 0),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ps_clean_payments_booking on "PS_CLEAN_payments"(booking_id);

create table "PS_CLEAN_notifications_log" (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references "PS_CLEAN_bookings"(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  type text not null check (type in ('confirmation', 'reminder', 'cancellation', 'payment_receipt')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_ps_clean_notifications_booking on "PS_CLEAN_notifications_log"(booking_id);
-- Used by the reminder job to find "bookings tomorrow with no reminder sent yet".
create index idx_ps_clean_notifications_type_status on "PS_CLEAN_notifications_log"(type, status);

create table "PS_CLEAN_admin_users" (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'owner')),
  display_name text,
  created_at timestamptz not null default now()
);

-- Single-row settings for the one business this app serves (see
-- DECISIONS.md #2 — no multi-tenant "businesses" table yet).
create table "PS_CLEAN_business_settings" (
  id boolean primary key default true check (id),
  business_name text not null default 'Cleaning Company',
  contact_email text,
  contact_phone text,
  timezone text not null default 'Europe/London',
  reminder_hours_before integer not null default 24 check (reminder_hours_before > 0),
  balance_charge_days_before integer not null default 2 check (balance_charge_days_before >= 0),
  updated_at timestamptz not null default now()
);

insert into "PS_CLEAN_business_settings" (id) values (true);
