-- Two service features.
--
-- 1. requires_quote: the owner flags a service whose real price can only be
--    given after looking at the job. The customer books at the listed (estimate)
--    price and the booking is stamped quote_status = 'pending'. The owner is
--    alerted and confirms the final price, which flips it to 'quoted'; the
--    cleaner and customer are told then. The balance cron skips 'pending' so
--    an estimate is never charged.
--
-- 2. customer_duration_minutes: the time customers are TOLD the job takes.
--    duration_minutes stays the total time blocked in the diary (clean plus
--    travel, set up etc), so slots, double-booking checks and ends_at are
--    untouched. E.g. a walkthrough is 20 minutes with the customer and blocks
--    45 minutes in the diary.
alter table "PS_CLEAN_services"
  add column if not exists requires_quote boolean not null default false,
  add column if not exists customer_duration_minutes integer
    check (customer_duration_minutes is null or customer_duration_minutes > 0);

alter table "PS_CLEAN_services"
  add constraint ps_clean_services_customer_duration_within_total
  check (customer_duration_minutes is null or customer_duration_minutes <= duration_minutes);

alter table "PS_CLEAN_bookings"
  add column if not exists quote_status text check (quote_status in ('pending', 'quoted')),
  add column if not exists quoted_at timestamptz;

-- Done as a trigger so every path that inserts a booking (customer checkout,
-- recurring generation, admin tools) is stamped the same way, without having
-- to re-declare the big ps_clean_create_booking function.
create or replace function ps_clean_stamp_quote_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quote_status is null
     and exists (select 1 from "PS_CLEAN_services" s where s.id = new.service_id and s.requires_quote) then
    new.quote_status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists ps_clean_stamp_quote_status on "PS_CLEAN_bookings";
create trigger ps_clean_stamp_quote_status
  before insert on "PS_CLEAN_bookings"
  for each row execute function ps_clean_stamp_quote_status();

-- An owner of the booking's business confirms the final price. Cleaners
-- never set it; they are told once it is confirmed.
create or replace function ps_clean_set_booking_quote(p_booking_id uuid, p_price_pence integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking "PS_CLEAN_bookings"%rowtype;
begin
  if p_price_pence is null or p_price_pence < 0 or p_price_pence > 10000000 then
    raise exception 'Enter a price between £0 and £100,000' using errcode = '22023';
  end if;

  select * into v_booking from "PS_CLEAN_bookings" where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if not ps_clean_is_owner_for(v_booking.business_id) then
    raise exception 'Only an owner can confirm a quote' using errcode = '42501';
  end if;
  if v_booking.quote_status is null then
    raise exception 'This booking does not need a quote' using errcode = '22023';
  end if;
  if v_booking.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'This booking is already %', v_booking.status using errcode = '22023';
  end if;
  if exists (
    select 1 from "PS_CLEAN_payments"
    where booking_id = p_booking_id and type = 'balance' and status in ('pending', 'succeeded')
  ) then
    raise exception 'The balance has already been charged, so the price can no longer change' using errcode = '22023';
  end if;
  if p_price_pence < v_booking.amount_paid_pence then
    raise exception 'The final price can''t be lower than what the customer has already paid' using errcode = '22023';
  end if;

  update "PS_CLEAN_bookings"
  set price_pence = p_price_pence, quote_status = 'quoted', quoted_at = now(), updated_at = now()
  where id = p_booking_id;
end;
$$;

grant execute on function ps_clean_set_booking_quote(uuid, integer) to authenticated;
