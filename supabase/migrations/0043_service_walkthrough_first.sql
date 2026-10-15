-- A service can be shown to customers (with a "from" price) without being
-- bookable directly: they are asked to book a walkthrough first and get a
-- quote after it. Used for jobs like end of tenancy cleans.
alter table "PS_CLEAN_services"
  add column if not exists walkthrough_first boolean not null default false;
