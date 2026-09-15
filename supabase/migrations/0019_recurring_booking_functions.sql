-- Lets ps_clean_create_booking be called by the recurring-booking
-- generation cron job, which has no signed-in user behind it (same shape
-- of problem as ps_clean_cancel_booking hit once already — see
-- DECISIONS.md #11 — but this time worth solving properly in the RPC
-- itself, since duplicating this function's working-hours/time-off/
-- EXCLUDE-constraint handling in app code to avoid it would be a much
-- worse outcome than one extra bypass clause). auth.role() = 'service_role'
-- is exactly what PostgREST sets for a request made with the service-role
-- key, and is unforgeable by a real customer's own session.
create or replace function ps_clean_create_booking(
  p_customer_id uuid,
  p_cleaner_id uuid,
  p_service_id uuid,
  p_address_id uuid,
  p_starts_at timestamptz,
  p_notes text default null,
  p_addon_ids uuid[] default '{}'::uuid[]
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
  v_addon_total integer := 0;
  v_addon_count integer;
  v_addon record;
begin
  if not ps_clean_is_admin()
     and auth.role() <> 'service_role'
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

  if array_length(p_addon_ids, 1) > 0 then
    select count(distinct sa.addon_id) into v_addon_count
    from "PS_CLEAN_service_addons" sa
    join "PS_CLEAN_addons" a on a.id = sa.addon_id
    where sa.service_id = p_service_id
      and a.is_active
      and sa.addon_id = any(p_addon_ids);

    if v_addon_count <> array_length((select array_agg(distinct x) from unnest(p_addon_ids) x), 1) then
      raise exception 'One or more add-ons are not available for this service' using errcode = '22023';
    end if;

    select coalesce(sum(a.price_pence), 0) into v_addon_total
    from "PS_CLEAN_addons" a
    where a.id = any(p_addon_ids);
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
      v_service.price_pence + v_addon_total, coalesce(v_service.deposit_pence, 0), p_notes
    )
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'That slot was just taken — please pick another time' using errcode = '23P01';
  end;

  if array_length(p_addon_ids, 1) > 0 then
    for v_addon in select id, name, price_pence from "PS_CLEAN_addons" where id = any(p_addon_ids)
    loop
      insert into "PS_CLEAN_booking_addons" (booking_id, addon_id, name, price_pence)
      values (v_booking.id, v_addon.id, v_addon.name, v_addon.price_pence);
    end loop;
  end if;

  return v_booking;
end;
$$;

-- Starts a recurring series anchored on an existing booking of the
-- caller's own — "make this a regular booking" — rather than a from-
-- scratch recurring-setup flow. Derives day-of-week/time-of-day and the
-- first future occurrence date from that booking, in the cleaner's own
-- timezone (see DECISIONS.md #5), rather than trusting client-supplied
-- values for either.
create or replace function ps_clean_create_recurring_booking(p_booking_id uuid, p_frequency text)
returns "PS_CLEAN_recurring_bookings"
language plpgsql security definer set search_path = public as $$
declare
  v_booking "PS_CLEAN_bookings";
  v_tz text;
  v_local_date date;
  v_local_time time;
  v_next_date date;
  v_recurring "PS_CLEAN_recurring_bookings";
begin
  if p_frequency not in ('weekly', 'fortnightly', 'monthly') then
    raise exception 'Invalid frequency' using errcode = '22023';
  end if;

  select * into v_booking from "PS_CLEAN_bookings" where id = p_booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if ps_clean_current_customer_id() is null or v_booking.customer_id is distinct from ps_clean_current_customer_id() then
    raise exception 'Not your booking' using errcode = '42501';
  end if;

  if v_booking.status = 'cancelled' then
    raise exception 'Cannot base a recurring series on a cancelled booking' using errcode = '22023';
  end if;

  if v_booking.recurring_booking_id is not null then
    raise exception 'This booking is already part of a recurring series' using errcode = '22023';
  end if;

  select coalesce(wh.timezone, 'Europe/London') into v_tz
  from "PS_CLEAN_cleaner_working_hours" wh
  where wh.cleaner_id = v_booking.cleaner_id
  limit 1;
  v_tz := coalesce(v_tz, 'Europe/London');

  v_local_date := (v_booking.starts_at at time zone v_tz)::date;
  v_local_time := (v_booking.starts_at at time zone v_tz)::time;

  v_next_date := (case p_frequency
    when 'weekly' then v_local_date + 7
    when 'fortnightly' then v_local_date + 14
    else v_local_date + interval '1 month'
  end)::date;

  insert into "PS_CLEAN_recurring_bookings" (customer_id, cleaner_id, service_id, address_id, frequency, time_of_day, next_occurrence_date)
  values (v_booking.customer_id, v_booking.cleaner_id, v_booking.service_id, v_booking.address_id, p_frequency, v_local_time, v_next_date)
  returning * into v_recurring;

  update "PS_CLEAN_bookings" set recurring_booking_id = v_recurring.id where id = p_booking_id;

  return v_recurring;
end;
$$;

grant execute on function ps_clean_create_recurring_booking(uuid, text) to authenticated;

-- Pausing/resuming/cancelling is a plain UPDATE via RLS's "recurring_bookings
-- update own" policy — no RPC needed for that, unlike creation above.
