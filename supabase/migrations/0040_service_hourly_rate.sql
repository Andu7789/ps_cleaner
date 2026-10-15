-- A service can be priced by the hour instead of a fixed amount. When set,
-- price_pence is kept equal to hourly_rate_pence x the clean time in hours
-- (worked out whenever the service is saved), so booking and payment code
-- keeps reading price_pence unchanged.
alter table "PS_CLEAN_services"
  add column if not exists hourly_rate_pence integer
    check (hourly_rate_pence is null or hourly_rate_pence >= 0);
