-- PS Cleaning: customer accounts, saved addresses, and bookings.
--
-- The booking overlap guarantee lives here: an EXCLUDE constraint on a
-- generated, buffer-padded range column. This is the source of truth for
-- "no cleaner is ever double-booked" — not application code, which can't
-- close the race between two concurrent booking requests on its own.
-- See DECISIONS.md #4.

create table "PS_CLEAN_customers" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  -- Set once a payment method is saved with setup_future_usage: 'off_session'
  -- (deposit-now, off-session-balance-later pattern — see DECISIONS.md #6).
  stripe_customer_id text unique,
  stripe_default_payment_method_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table "PS_CLEAN_customer_addresses" (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references "PS_CLEAN_customers"(id) on delete cascade,
  label text not null default 'Home',
  line1 text not null,
  line2 text,
  city text not null,
  postcode text not null,
  -- Gate codes, key safe location, pet warnings, parking notes, etc.
  access_notes text,
  is_default boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_ps_clean_addresses_customer on "PS_CLEAN_customer_addresses"(customer_id);

create table "PS_CLEAN_bookings" (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT, not CASCADE: a customer/cleaner/service/address row must not
  -- vanish out from under booking history used for accounting and disputes.
  customer_id uuid not null references "PS_CLEAN_customers"(id) on delete restrict,
  cleaner_id uuid not null references "PS_CLEAN_cleaners"(id) on delete restrict,
  service_id uuid not null references "PS_CLEAN_services"(id) on delete restrict,
  address_id uuid not null references "PS_CLEAN_customer_addresses"(id) on delete restrict,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Copied from the service at booking time (not re-read live) so a later
  -- price/buffer change never silently reshapes a booking already made.
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  price_pence integer not null check (price_pence >= 0),
  deposit_pence integer not null default 0 check (deposit_pence >= 0),
  amount_paid_pence integer not null default 0 check (amount_paid_pence >= 0),
  notes text,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_valid_range check (ends_at > starts_at),
  -- The job itself plus its buffer on both sides, as one range — needed as
  -- a real (indexable) column for the EXCLUDE constraint below. NOT a
  -- GENERATED column: timestamptz +/- interval is STABLE, not IMMUTABLE
  -- (its result can depend on the timezone setting), and Postgres requires
  -- generated-column expressions to be IMMUTABLE. Maintained instead by the
  -- BEFORE INSERT/UPDATE trigger defined right after this table.
  padded_range tstzrange,
  -- The actual double-booking guard. A cancelled booking frees its slot
  -- immediately, so it's excluded from the conflict check.
  constraint ps_clean_bookings_no_overlap
    exclude using gist (cleaner_id with =, padded_range with &&)
    where (status <> 'cancelled')
);

create or replace function ps_clean_set_booking_padded_range()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.padded_range := tstzrange(
    new.starts_at - (new.buffer_before_minutes || ' minutes')::interval,
    new.ends_at + (new.buffer_after_minutes || ' minutes')::interval,
    '[)'
  );
  return new;
end;
$$;

create trigger trg_ps_clean_bookings_padded_range
  before insert or update on "PS_CLEAN_bookings"
  for each row execute function ps_clean_set_booking_padded_range();

create index idx_ps_clean_bookings_customer on "PS_CLEAN_bookings"(customer_id);
create index idx_ps_clean_bookings_cleaner_range on "PS_CLEAN_bookings" using gist (cleaner_id, padded_range);
create index idx_ps_clean_bookings_starts_at on "PS_CLEAN_bookings"(starts_at);
