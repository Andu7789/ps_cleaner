-- White-label multi-tenancy, phase 1: the tenant table itself.
-- Structural replacement for PS_CLEAN_business_settings (dropped in 0030
-- once its one row's data is copied here) — same fields plus the columns
-- needed to resolve a business by request host (slug/custom_domain) and
-- placeholders for per-business billing/notification credentials that
-- aren't wired up yet (see DECISIONS.md — shared platform credentials for
-- now, per explicit choice).
create table "PS_CLEAN_businesses" (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  business_name text not null,
  custom_domain text unique,
  brand_color text not null default '#0f766e',
  logo_url text,
  contact_email text,
  contact_phone text,
  timezone text not null default 'Europe/London',
  reminder_hours_before integer not null default 24 check (reminder_hours_before > 0),
  balance_charge_days_before integer not null default 2 check (balance_charge_days_before >= 0),
  stripe_connect_account_id text,
  notify_from_email text,
  twilio_from_number text,
  created_at timestamptz not null default now()
);

-- Seed the current (only, so far) business from the existing single-row
-- settings table, so every other table's business_id backfill (0030) has
-- somewhere to point.
insert into "PS_CLEAN_businesses" (
  slug, business_name, custom_domain, contact_email, contact_phone,
  timezone, reminder_hours_before, balance_charge_days_before
)
select
  'ps-clean', business_name, 'psclean.site', contact_email, contact_phone,
  timezone, reminder_hours_before, balance_charge_days_before
from "PS_CLEAN_business_settings"
where id = true;

alter table "PS_CLEAN_businesses" enable row level security;

-- Branding must be readable pre-login (the public booking site resolves
-- its own business by host before any auth exists) — same shape as every
-- other public-catalog table in this schema (services/cleaners/addons).
-- Nothing sensitive is exposed by this: the billing/credential columns
-- above are populated later and are only ever read server-side via
-- createServiceClient(), never selected by browser/anon code — see
-- DECISIONS.md.
create policy "businesses public read" on "PS_CLEAN_businesses"
  for select using (true);
-- No write policy yet: business rows are created via the service-role key
-- (manual/scripted, see DECISIONS.md) — no self-serve tenant management UI
-- exists, matching where Root Cafe's own platform-admin tenant management
-- still is.
