-- White-label multi-tenancy, phase 2: business_id on every other table.
-- Two-step (nullable + backfill, then NOT NULL) same shape as this
-- workspace's own Root Cafe migrations 0013/0014 — safe on live data even
-- though there's currently only test data to backfill.
alter table "PS_CLEAN_cleaners" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_services" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_cleaner_services" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_cleaner_working_hours" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_cleaner_time_off" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_customers" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_customer_addresses" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_bookings" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_payments" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_notifications_log" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_admin_users" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_admin_change_log" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_reviews" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_addons" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_service_addons" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_booking_addons" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_customer_credits" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_cleaner_payouts" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_waitlist_entries" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_recurring_bookings" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_booking_photos" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_cleaner_invoices" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_cleaner_invoice_items" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_calculator_room_types" add column business_id uuid references "PS_CLEAN_businesses"(id);
alter table "PS_CLEAN_booking_calculator_selections" add column business_id uuid references "PS_CLEAN_businesses"(id);

-- Backfill every existing row (there's exactly one business right now) —
-- no data to migrate since this is a fresh project seeded with test data
-- only, but the two-step shape is kept for parity with how this pattern
-- must run on a live table.
do $$
declare
  v_default_business uuid;
begin
  select id into v_default_business from "PS_CLEAN_businesses" where slug = 'ps-clean';

  update "PS_CLEAN_cleaners" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_services" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_cleaner_services" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_cleaner_working_hours" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_cleaner_time_off" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_customers" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_customer_addresses" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_bookings" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_payments" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_notifications_log" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_admin_users" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_admin_change_log" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_reviews" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_addons" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_service_addons" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_booking_addons" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_customer_credits" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_cleaner_payouts" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_waitlist_entries" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_recurring_bookings" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_booking_photos" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_cleaner_invoices" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_cleaner_invoice_items" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_calculator_room_types" set business_id = v_default_business where business_id is null;
  update "PS_CLEAN_booking_calculator_selections" set business_id = v_default_business where business_id is null;
end $$;

alter table "PS_CLEAN_cleaners" alter column business_id set not null;
alter table "PS_CLEAN_services" alter column business_id set not null;
alter table "PS_CLEAN_cleaner_services" alter column business_id set not null;
alter table "PS_CLEAN_cleaner_working_hours" alter column business_id set not null;
alter table "PS_CLEAN_cleaner_time_off" alter column business_id set not null;
alter table "PS_CLEAN_customers" alter column business_id set not null;
alter table "PS_CLEAN_customer_addresses" alter column business_id set not null;
alter table "PS_CLEAN_bookings" alter column business_id set not null;
alter table "PS_CLEAN_payments" alter column business_id set not null;
alter table "PS_CLEAN_notifications_log" alter column business_id set not null;
alter table "PS_CLEAN_admin_users" alter column business_id set not null;
alter table "PS_CLEAN_admin_change_log" alter column business_id set not null;
alter table "PS_CLEAN_reviews" alter column business_id set not null;
alter table "PS_CLEAN_addons" alter column business_id set not null;
alter table "PS_CLEAN_service_addons" alter column business_id set not null;
alter table "PS_CLEAN_booking_addons" alter column business_id set not null;
alter table "PS_CLEAN_customer_credits" alter column business_id set not null;
alter table "PS_CLEAN_cleaner_payouts" alter column business_id set not null;
alter table "PS_CLEAN_waitlist_entries" alter column business_id set not null;
alter table "PS_CLEAN_recurring_bookings" alter column business_id set not null;
alter table "PS_CLEAN_booking_photos" alter column business_id set not null;
alter table "PS_CLEAN_cleaner_invoices" alter column business_id set not null;
alter table "PS_CLEAN_cleaner_invoice_items" alter column business_id set not null;
alter table "PS_CLEAN_calculator_room_types" alter column business_id set not null;
alter table "PS_CLEAN_booking_calculator_selections" alter column business_id set not null;

create index idx_ps_clean_cleaners_business on "PS_CLEAN_cleaners"(business_id);
create index idx_ps_clean_services_business on "PS_CLEAN_services"(business_id);
create index idx_ps_clean_customers_business on "PS_CLEAN_customers"(business_id);
create index idx_ps_clean_bookings_business on "PS_CLEAN_bookings"(business_id);

-- Admin identity becomes business-scoped: the same person (most obviously
-- you, running more than one test business) can legitimately be an admin
-- of several businesses, so the global uniqueness added in 0027 is now
-- wrong — replaced with per-business uniqueness instead. Customers and
-- cleaners deliberately keep their existing global-per-user identity (see
-- DECISIONS.md) since ps_clean_current_customer_id()/
-- ps_clean_current_cleaner_id() return a single scalar row with no request
-- -level "current business" context available to disambiguate — RLS has no
-- session concept of "which business is this request for", only "which
-- rows does this row's own business_id say I can see" (is_admin_for below),
-- so admin's EXISTS-based checks tolerate multiple rows per user but a
-- scalar lookup can't.
drop index idx_ps_clean_admin_users_email;
drop index idx_ps_clean_admin_users_user_id;
create unique index idx_ps_clean_admin_users_business_email on "PS_CLEAN_admin_users" (business_id, lower(email));
create unique index idx_ps_clean_admin_users_business_user_id on "PS_CLEAN_admin_users" (business_id, user_id) where user_id is not null;

-- Superseded by PS_CLEAN_businesses (0029).
drop table "PS_CLEAN_business_settings";
