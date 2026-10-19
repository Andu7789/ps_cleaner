-- Owner update of 19 October 2026.
--
-- 1. Customers no longer have accounts. Every booking gets a short reference
--    the customer uses to change their booking later.
-- 2. A third way in: the customer has a key box. The code is entered by the
--    owner on the address and shown to the cleaner.
-- 3. The owner prices a job on the bookings list: service required, hours,
--    payment format, an estimate that can be emailed as a quote, then a final
--    price and an invoice once the job is done.
-- 4. A job can only be marked complete once it has before and after photos.
-- 5. Bookings can be moved to a new time by the server alone (the customer
--    proves who they are with their reference, not a sign in).
-- 6. Bookings remember when the owner was warned a job had overrun.

-- 1. Booking references -----------------------------------------------------

-- 8 characters from an alphabet with no look alike letters or digits. Taken
-- from gen_random_uuid so the reference can't be predicted.
create or replace function ps_clean_new_booking_reference()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_ref text;
  i integer;
begin
  loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_ref := '';
    for i in 0..7 loop
      v_ref := v_ref || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from "PS_CLEAN_bookings" where reference = v_ref);
  end loop;
  return v_ref;
end;
$$;

alter table "PS_CLEAN_bookings" add column if not exists reference text;

-- Must exist before the backfill below calls ps_clean_new_booking_reference,
-- which looks the column up.
update "PS_CLEAN_bookings" set reference = ps_clean_new_booking_reference() where reference is null;

alter table "PS_CLEAN_bookings" alter column reference set not null;
create unique index if not exists ps_clean_bookings_reference_key on "PS_CLEAN_bookings" (reference);

-- A trigger so every path that inserts a booking (checkout, recurring
-- generation, demo data, admin tools) gets one without passing it in.
create or replace function ps_clean_stamp_booking_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference is null then
    new.reference := ps_clean_new_booking_reference();
  end if;
  return new;
end;
$$;

drop trigger if exists ps_clean_stamp_booking_reference on "PS_CLEAN_bookings";
create trigger ps_clean_stamp_booking_reference
  before insert on "PS_CLEAN_bookings"
  for each row execute function ps_clean_stamp_booking_reference();

-- 2. Key box ----------------------------------------------------------------

alter table "PS_CLEAN_bookings" drop constraint if exists "PS_CLEAN_bookings_access_method_check";
alter table "PS_CLEAN_bookings"
  add constraint "PS_CLEAN_bookings_access_method_check" check (access_method in ('keys', 'let_in', 'key_box'));

-- Lives on the address, so the next booking at the same home already has it.
alter table "PS_CLEAN_customer_addresses" add column if not exists key_box_code text
  check (key_box_code is null or length(key_box_code) <= 40);

-- 3. Job pricing ------------------------------------------------------------

-- service_required_id is deliberately not a foreign key: a second link from
-- bookings to services would make every existing PS_CLEAN_services(...) embed
-- on bookings ambiguous to PostgREST. The app checks it belongs to the business.
alter table "PS_CLEAN_bookings"
  add column if not exists service_required_id uuid,
  add column if not exists hours_required numeric(5, 2) check (hours_required is null or (hours_required > 0 and hours_required <= 100)),
  add column if not exists payment_format text check (payment_format in ('set_price', 'hourly')),
  add column if not exists estimated_price_pence integer check (estimated_price_pence is null or estimated_price_pence >= 0),
  add column if not exists final_price_pence integer check (final_price_pence is null or final_price_pence >= 0),
  add column if not exists quote_sent_at timestamptz,
  add column if not exists invoice_sent_at timestamptz,
  add column if not exists overdue_alert_sent_at timestamptz;

-- Which cleans a returning customer can book from the homepage.
alter table "PS_CLEAN_services"
  add column if not exists returning_customers_can_book boolean not null default true;

-- White Glove only lets returning customers book a Domestic Clean.
update "PS_CLEAN_services"
set returning_customers_can_book = false
where business_id = (select id from "PS_CLEAN_businesses" where slug = 'ps-clean')
  and trim(name) <> 'Domestic Clean';

-- The booking function now accepts the key box answer. Same signature as
-- migration 0028, so this replaces the body without adding an overload.
create or replace function ps_clean_create_booking(
  p_customer_id uuid,
  p_cleaner_id uuid,
  p_service_id uuid,
  p_address_id uuid,
  p_starts_at timestamptz,
  p_notes text default null,
  p_addon_ids uuid[] default '{}',
  p_wants_meet_cleaner_first boolean default false,
  p_parking_available boolean default false,
  p_has_pets boolean default false,
  p_access_method text default 'let_in',
  p_room_selections jsonb default '[]'::jsonb
)
returns "PS_CLEAN_bookings"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service "PS_CLEAN_services";
  v_business_id uuid;
  v_ends_at timestamptz;
  v_booking "PS_CLEAN_bookings";
  v_lock_key bigint;
  v_day date;
  v_tz text;
  v_in_hours boolean;
  v_on_time_off boolean;
  v_addon_total integer := 0;
  v_addon_count integer;
  v_addon record;
  v_price_pence integer;
  v_calc_total integer := 0;
  v_extra_minutes integer := 0;
  v_selection jsonb;
  v_room_type "PS_CLEAN_calculator_room_types";
  v_quantity integer;
begin
  if p_access_method not in ('keys', 'let_in', 'key_box') then
    raise exception 'Invalid access method' using errcode = '22023';
  end if;

  select * into v_service from "PS_CLEAN_services" s where s.id = p_service_id and s.is_active;
  if not found then
    raise exception 'Service not found or inactive' using errcode = 'P0002';
  end if;
  v_business_id := v_service.business_id;

  if not ps_clean_is_admin_for(v_business_id)
     and auth.role() <> 'service_role'
     and (ps_clean_current_customer_id() is null or p_customer_id is distinct from ps_clean_current_customer_id())
  then
    raise exception 'Cannot book on behalf of another customer' using errcode = '42501';
  end if;

  if not exists (
    select 1 from "PS_CLEAN_customer_addresses" a
    where a.id = p_address_id and a.customer_id = p_customer_id and a.business_id = v_business_id
  ) then
    raise exception 'Address does not belong to this customer' using errcode = '42501';
  end if;

  if not exists (select 1 from "PS_CLEAN_customers" c where c.id = p_customer_id and c.business_id = v_business_id) then
    raise exception 'Customer does not belong to this business' using errcode = '42501';
  end if;

  if not exists (
    select 1 from "PS_CLEAN_cleaner_services" cs
    join "PS_CLEAN_cleaners" c on c.id = cs.cleaner_id
    where cs.cleaner_id = p_cleaner_id and cs.service_id = p_service_id
      and c.is_active and c.business_id = v_business_id
  ) then
    raise exception 'Cleaner is not qualified for this service' using errcode = '22023';
  end if;

  if array_length(p_addon_ids, 1) > 0 then
    select count(distinct sa.addon_id) into v_addon_count
    from "PS_CLEAN_service_addons" sa
    join "PS_CLEAN_addons" a on a.id = sa.addon_id
    where sa.service_id = p_service_id
      and a.is_active
      and a.business_id = v_business_id
      and sa.addon_id = any(p_addon_ids);

    if v_addon_count <> array_length((select array_agg(distinct x) from unnest(p_addon_ids) x), 1) then
      raise exception 'One or more add-ons are not available for this service' using errcode = '22023';
    end if;

    select coalesce(sum(a.price_pence), 0) into v_addon_total
    from "PS_CLEAN_addons" a
    where a.id = any(p_addon_ids);
  end if;

  if v_service.use_calculator and jsonb_array_length(p_room_selections) > 0 then
    for v_selection in select * from jsonb_array_elements(p_room_selections)
    loop
      v_quantity := coalesce((v_selection->>'quantity')::integer, 0);
      if v_quantity < 0 or v_quantity > 100 then
        raise exception 'Invalid room quantity' using errcode = '22023';
      end if;
      if v_quantity = 0 then
        continue;
      end if;

      select * into v_room_type
      from "PS_CLEAN_calculator_room_types"
      where id = (v_selection->>'room_type_id')::uuid and is_active and business_id = v_business_id;
      if not found then
        raise exception 'Unknown or inactive room type' using errcode = '22023';
      end if;

      if not v_service.rooms_no_charge then
        v_calc_total := v_calc_total + v_quantity * v_room_type.price_per_unit_pence;
        v_extra_minutes := v_extra_minutes + v_quantity * v_room_type.minutes_per_unit;
      end if;
    end loop;
  end if;

  v_price_pence := v_service.price_pence + v_addon_total + v_calc_total;

  v_ends_at := p_starts_at + ((v_service.duration_minutes + v_extra_minutes) || ' minutes')::interval;

  v_day := p_starts_at::date;
  v_lock_key := hashtextextended(p_cleaner_id::text || v_day::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select wh.timezone into v_tz
  from "PS_CLEAN_cleaner_working_hours" wh
  where wh.cleaner_id = p_cleaner_id
  limit 1;
  v_tz := coalesce(v_tz, 'Europe/London');

  select exists (
    select 1 from "PS_CLEAN_cleaner_working_hours" wh
    where wh.cleaner_id = p_cleaner_id
      and wh.day_of_week = extract(dow from p_starts_at at time zone v_tz)::smallint
      and tstzrange(
            ((p_starts_at at time zone v_tz)::date::text || ' ' || wh.start_time::text)::timestamp at time zone wh.timezone,
            ((p_starts_at at time zone v_tz)::date::text || ' ' || wh.end_time::text)::timestamp at time zone wh.timezone,
            '[)'
          ) @> tstzrange(p_starts_at, v_ends_at, '[)')
  ) into v_in_hours;

  if not v_in_hours then
    raise exception 'Requested time is outside this cleaner''s working hours' using errcode = '22023';
  end if;

  select exists (
    select 1 from "PS_CLEAN_cleaner_time_off" t
    where t.cleaner_id = p_cleaner_id
      and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, v_ends_at, '[)')
  ) into v_on_time_off;

  if v_on_time_off then
    raise exception 'Cleaner is unavailable (time off) at that time' using errcode = '22023';
  end if;

  begin
    insert into "PS_CLEAN_bookings" (
      business_id, customer_id, cleaner_id, service_id, address_id,
      starts_at, ends_at, buffer_before_minutes, buffer_after_minutes,
      price_pence, deposit_pence, notes,
      wants_meet_cleaner_first, parking_available, has_pets, access_method
    ) values (
      v_business_id, p_customer_id, p_cleaner_id, p_service_id, p_address_id,
      p_starts_at, v_ends_at, v_service.buffer_before_minutes, v_service.buffer_after_minutes,
      v_price_pence, coalesce(v_service.deposit_pence, 0), p_notes,
      p_wants_meet_cleaner_first, p_parking_available, p_has_pets, p_access_method
    )
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'That slot was just taken, please pick another time' using errcode = '23P01';
  end;

  if array_length(p_addon_ids, 1) > 0 then
    for v_addon in select id, name, price_pence from "PS_CLEAN_addons" where id = any(p_addon_ids)
    loop
      insert into "PS_CLEAN_booking_addons" (business_id, booking_id, addon_id, name, price_pence)
      values (v_business_id, v_booking.id, v_addon.id, v_addon.name, v_addon.price_pence);
    end loop;
  end if;

  if v_service.use_calculator and jsonb_array_length(p_room_selections) > 0 then
    for v_selection in select * from jsonb_array_elements(p_room_selections)
    loop
      v_quantity := coalesce((v_selection->>'quantity')::integer, 0);
      if v_quantity = 0 then
        continue;
      end if;

      select * into v_room_type
      from "PS_CLEAN_calculator_room_types"
      where id = (v_selection->>'room_type_id')::uuid;

      insert into "PS_CLEAN_booking_calculator_selections"
        (business_id, booking_id, room_type_id, room_type_name, price_per_unit_pence, quantity, line_total_pence)
      values (
        v_business_id, v_booking.id, v_room_type.id, v_room_type.name,
        case when v_service.rooms_no_charge then 0 else v_room_type.price_per_unit_pence end,
        v_quantity,
        case when v_service.rooms_no_charge then 0 else v_quantity * v_room_type.price_per_unit_pence end
      );
    end loop;
  end if;

  return v_booking;
end;
$$;

-- 4. Photos before completing ----------------------------------------------

create or replace function ps_clean_cleaner_complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleaner_id uuid := ps_clean_current_cleaner_id();
  v_booking "PS_CLEAN_bookings"%rowtype;
begin
  if v_cleaner_id is null then
    raise exception 'Not a cleaner' using errcode = '42501';
  end if;

  select * into v_booking from "PS_CLEAN_bookings" where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if v_booking.cleaner_id is distinct from v_cleaner_id then
    raise exception 'Not your booking' using errcode = '42501';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'Only a confirmed booking can be marked complete' using errcode = '22023';
  end if;

  if not exists (select 1 from "PS_CLEAN_booking_photos" where booking_id = p_booking_id and kind = 'before')
     or not exists (select 1 from "PS_CLEAN_booking_photos" where booking_id = p_booking_id and kind = 'after')
  then
    raise exception 'Add at least one before photo and one after photo first' using errcode = '22023';
  end if;

  update "PS_CLEAN_bookings"
  set status = 'completed', updated_at = now()
  where id = p_booking_id;
end;
$$;

-- 5. Moving a booking -------------------------------------------------------

-- Server only: the customer proves who they are with their booking reference,
-- which the server checks before calling this. Same working hours, time off
-- and double booking rules as a new booking.
create or replace function ps_clean_reschedule_booking(p_booking_id uuid, p_cleaner_id uuid, p_starts_at timestamptz)
returns "PS_CLEAN_bookings"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking "PS_CLEAN_bookings";
  v_length interval;
  v_ends_at timestamptz;
  v_tz text;
  v_in_hours boolean;
  v_on_time_off boolean;
begin
  select * into v_booking from "PS_CLEAN_bookings" where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if v_booking.status not in ('confirmed', 'pending_payment') then
    raise exception 'This booking can no longer be changed' using errcode = '22023';
  end if;
  if p_starts_at <= now() then
    raise exception 'Please pick a time in the future' using errcode = '22023';
  end if;

  if not exists (
    select 1 from "PS_CLEAN_cleaner_services" cs
    join "PS_CLEAN_cleaners" c on c.id = cs.cleaner_id
    where cs.cleaner_id = p_cleaner_id and cs.service_id = v_booking.service_id
      and c.is_active and c.business_id = v_booking.business_id
  ) then
    raise exception 'Cleaner is not available for this service' using errcode = '22023';
  end if;

  -- Keeps the booked length, including any extra time from room counts.
  v_length := v_booking.ends_at - v_booking.starts_at;
  v_ends_at := p_starts_at + v_length;

  perform pg_advisory_xact_lock(hashtextextended(p_cleaner_id::text || p_starts_at::date::text, 0));

  select wh.timezone into v_tz from "PS_CLEAN_cleaner_working_hours" wh where wh.cleaner_id = p_cleaner_id limit 1;
  v_tz := coalesce(v_tz, 'Europe/London');

  select exists (
    select 1 from "PS_CLEAN_cleaner_working_hours" wh
    where wh.cleaner_id = p_cleaner_id
      and wh.day_of_week = extract(dow from p_starts_at at time zone v_tz)::smallint
      and tstzrange(
            ((p_starts_at at time zone v_tz)::date::text || ' ' || wh.start_time::text)::timestamp at time zone wh.timezone,
            ((p_starts_at at time zone v_tz)::date::text || ' ' || wh.end_time::text)::timestamp at time zone wh.timezone,
            '[)'
          ) @> tstzrange(p_starts_at, v_ends_at, '[)')
  ) into v_in_hours;
  if not v_in_hours then
    raise exception 'That time is outside the cleaner''s working hours' using errcode = '22023';
  end if;

  select exists (
    select 1 from "PS_CLEAN_cleaner_time_off" t
    where t.cleaner_id = p_cleaner_id
      and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, v_ends_at, '[)')
  ) into v_on_time_off;
  if v_on_time_off then
    raise exception 'The cleaner is unavailable at that time' using errcode = '22023';
  end if;

  begin
    update "PS_CLEAN_bookings"
    set cleaner_id = p_cleaner_id, starts_at = p_starts_at, ends_at = v_ends_at,
        overdue_alert_sent_at = null, updated_at = now()
    where id = p_booking_id
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'That slot was just taken, please pick another time' using errcode = '23P01';
  end;

  return v_booking;
end;
$$;

revoke all on function ps_clean_reschedule_booking(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function ps_clean_reschedule_booking(uuid, uuid, timestamptz) to service_role;

-- 6. Overdue job alerts -----------------------------------------------------

-- A random key the scheduler sends to /api/cron/overdue-jobs, so the job
-- needs no secret copied out of Vercel. Server only: RLS on, no policies.
create table if not exists "PS_CLEAN_private_settings" (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table "PS_CLEAN_private_settings" enable row level security;
insert into "PS_CLEAN_private_settings" (key, value)
values ('cron_key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;
