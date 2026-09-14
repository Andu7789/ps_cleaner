-- Fixes the NULL-safe ownership-check bypass found by the test agent — see
-- DECISIONS.md #7 for the full writeup. Applied here as its own migration
-- (rather than editing 0004 in place) since 0004 had already been applied
-- to the live database by the time this was caught; 0004's own source in
-- this repo has ALSO been corrected to match, so a fresh clone of this repo
-- never sees the buggy version at all — this file exists purely so the
-- live database's migration history matches what was actually run.
create or replace function ps_clean_create_booking(
  p_customer_id uuid,
  p_cleaner_id uuid,
  p_service_id uuid,
  p_address_id uuid,
  p_starts_at timestamptz,
  p_notes text default null
)
returns "PS_CLEAN_bookings"
language plpgsql security definer set search_path = public as $$
declare
  v_service "PS_CLEAN_services";
  v_ends_at timestamptz;
  v_booking "PS_CLEAN_bookings";
  v_lock_key bigint;
  v_day date;
  v_tz text;
  v_in_hours boolean;
  v_on_time_off boolean;
begin
  if not ps_clean_is_admin()
     and (ps_clean_current_customer_id() is null or p_customer_id is distinct from ps_clean_current_customer_id())
  then
    raise exception 'Cannot book on behalf of another customer' using errcode = '42501';
  end if;

  if not exists (select 1 from "PS_CLEAN_customer_addresses" a where a.id = p_address_id and a.customer_id = p_customer_id) then
    raise exception 'Address does not belong to this customer' using errcode = '42501';
  end if;

  select * into v_service from "PS_CLEAN_services" s where s.id = p_service_id and s.is_active;
  if not found then
    raise exception 'Service not found or inactive' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from "PS_CLEAN_cleaner_services" cs
    join "PS_CLEAN_cleaners" c on c.id = cs.cleaner_id
    where cs.cleaner_id = p_cleaner_id and cs.service_id = p_service_id and c.is_active
  ) then
    raise exception 'Cleaner is not qualified for this service' using errcode = '22023';
  end if;

  v_ends_at := p_starts_at + (v_service.duration_minutes || ' minutes')::interval;

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
      customer_id, cleaner_id, service_id, address_id,
      starts_at, ends_at, buffer_before_minutes, buffer_after_minutes,
      price_pence, deposit_pence, notes
    ) values (
      p_customer_id, p_cleaner_id, p_service_id, p_address_id,
      p_starts_at, v_ends_at, v_service.buffer_before_minutes, v_service.buffer_after_minutes,
      v_service.price_pence, coalesce(v_service.deposit_pence, 0), p_notes
    )
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'That slot was just taken — please pick another time' using errcode = '23P01';
  end;

  return v_booking;
end;
$$;

create or replace function ps_clean_cancel_booking(p_booking_id uuid, p_reason text default null)
returns "PS_CLEAN_bookings"
language plpgsql security definer set search_path = public as $$
declare
  v_booking "PS_CLEAN_bookings";
begin
  select * into v_booking from "PS_CLEAN_bookings" where id = p_booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if not ps_clean_is_admin()
     and (ps_clean_current_customer_id() is null or v_booking.customer_id is distinct from ps_clean_current_customer_id())
  then
    raise exception 'Not your booking' using errcode = '42501';
  end if;

  if v_booking.status = 'cancelled' then
    return v_booking;
  end if;

  update "PS_CLEAN_bookings"
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason, updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;
