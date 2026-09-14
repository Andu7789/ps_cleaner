-- PS Cleaning: cleaners, services, qualifications, and cleaner scheduling.
--
-- Every table in this app is prefixed PS_CLEAN_ so it stays cleanly
-- separable from other apps sharing this Supabase project, and so this
-- schema can be lifted into its own dedicated project later with no
-- name collisions. See /DECISIONS.md #1 and #2.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- needed by the booking overlap EXCLUDE constraint (0002)

create table "PS_CLEAN_cleaners" (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: Core-tier cleaners are admin-managed and never log in
  -- themselves (see DECISIONS.md #3). Set this the day a cleaner portal
  -- ships without needing a migration.
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  bio text,
  photo_url text,
  calendar_color text not null default '#2563eb',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table "PS_CLEAN_services" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  -- Asymmetric on purpose: prep time before a job and travel time after it
  -- are different things and don't have to match. Most cleaning jobs only
  -- need an after-buffer (travel to the next job); before-buffer defaults
  -- to 0 but is there for a service that genuinely needs setup time.
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  price_pence integer not null check (price_pence >= 0),
  -- Null = full price due at booking. Set = this amount is taken as a
  -- deposit at booking time, remainder due later (see 0003 payments).
  deposit_pence integer check (deposit_pence is null or deposit_pence >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deposit_not_more_than_price check (deposit_pence is null or deposit_pence <= price_pence)
);

-- Which cleaners are qualified/trained to perform which services.
create table "PS_CLEAN_cleaner_services" (
  cleaner_id uuid not null references "PS_CLEAN_cleaners"(id) on delete cascade,
  service_id uuid not null references "PS_CLEAN_services"(id) on delete cascade,
  primary key (cleaner_id, service_id)
);

-- Recurring weekly availability. day_of_week follows Postgres's own
-- EXTRACT(DOW FROM ...) convention: 0 = Sunday .. 6 = Saturday. Multiple
-- rows per (cleaner, day) are allowed for split shifts.
create table "PS_CLEAN_cleaner_working_hours" (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references "PS_CLEAN_cleaners"(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  -- Stored explicitly (not just assumed) so working hours are interpreted
  -- correctly across the BST/GMT transition and if the business ever
  -- operates cleaners in more than one timezone. See DECISIONS.md #5.
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now(),
  constraint working_hours_valid_range check (end_time > start_time)
);

-- One-off unavailability: holiday, sickness, a blocked-out morning, etc.
-- Stored as explicit timestamptz ranges rather than dates so a half-day
-- off is representable without a separate "partial day" concept.
create table "PS_CLEAN_cleaner_time_off" (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references "PS_CLEAN_cleaners"(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint time_off_valid_range check (ends_at > starts_at)
);

create index idx_ps_clean_cleaner_services_service on "PS_CLEAN_cleaner_services"(service_id);
create index idx_ps_clean_working_hours_cleaner on "PS_CLEAN_cleaner_working_hours"(cleaner_id);
create index idx_ps_clean_time_off_cleaner_range on "PS_CLEAN_cleaner_time_off" using gist (cleaner_id, tstzrange(starts_at, ends_at));
