-- Where a business's card payments end up.
--   platform: charged on the platform Stripe account and kept there (today's
--             behaviour, and the default so existing businesses don't change).
--   connect:  charged on the platform account but sent on to the owner's own
--             Stripe Express account (a destination charge, no fee taken).
-- stripe_connect_account_id already exists from migration 0029.
alter table "PS_CLEAN_businesses"
  add column if not exists payment_mode text not null default 'platform'
    check (payment_mode in ('platform', 'connect')),
  -- True once the connected account can take charges and receive payouts.
  add column if not exists stripe_charges_enabled boolean not null default false;
