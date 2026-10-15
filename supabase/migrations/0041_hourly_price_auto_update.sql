-- Keeps price_pence in step with the hourly rate automatically. Whenever a
-- service with an hourly rate is saved (or its times change), the price is
-- recalculated as rate x clean time in hours, rounded to the nearest penny.
create or replace function ps_clean_apply_hourly_price()
returns trigger
language plpgsql
as $$
begin
  if new.hourly_rate_pence is not null then
    new.price_pence := round(
      new.hourly_rate_pence::numeric * coalesce(new.customer_duration_minutes, new.duration_minutes) / 60
    )::integer;
  end if;
  return new;
end;
$$;

drop trigger if exists ps_clean_services_hourly_price on "PS_CLEAN_services";
create trigger ps_clean_services_hourly_price
  before insert or update on "PS_CLEAN_services"
  for each row execute function ps_clean_apply_hourly_price();

-- Bring any existing hourly services up to date.
update "PS_CLEAN_services" set hourly_rate_pence = hourly_rate_pence where hourly_rate_pence is not null;
