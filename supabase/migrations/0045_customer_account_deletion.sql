-- A customer who deletes their account keeps an anonymised row so their past
-- bookings (which must be kept for the business's records) still have
-- somewhere to point. That row is no longer linked to a login, so user_id
-- becomes optional and removing the login leaves the row behind instead of
-- trying to cascade into bookings.
alter table "PS_CLEAN_customers" alter column user_id drop not null;
alter table "PS_CLEAN_customers" drop constraint if exists "PS_CLEAN_customers_user_id_fkey";
alter table "PS_CLEAN_customers"
  add constraint "PS_CLEAN_customers_user_id_fkey"
  foreign key (user_id) references auth.users(id) on delete set null;
