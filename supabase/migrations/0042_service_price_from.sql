-- Lets an owner show a service's price as "From £X" without needing the
-- quote flow. The price still charged is price_pence; this only changes how
-- the price is described to customers.
alter table "PS_CLEAN_services"
  add column if not exists price_is_from boolean not null default false;
