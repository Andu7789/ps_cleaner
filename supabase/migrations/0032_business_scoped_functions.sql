-- White-label multi-tenancy, phase 4: the SECURITY DEFINER RPCs bypass RLS
-- internally, so each needs its own explicit business check — a policy
-- change alone does nothing for these. Business is derived from a row the
-- caller already had to prove access to (the service/booking being
-- operated on), never trusted as a bare client-supplied parameter, so
-- there's nothing here for a caller to spoof by passing a different id.

-- Closes a scalar-lookup ambiguity: ps_clean_current_cleaner_id() assumes
-- at most one cleaner row per auth user. Cleaners never had a uniqueness
-- constraint on user_id at all (only app-level "link on first login by
-- email" discipline enforced it in practice) — now that a cleaner could in
-- principle be invited at a second business, enforce it for real.
create unique index idx_ps_clean_cleaners_user_id on "PS_CLEAN_cleaners" (user_id) where user_id is not null;

create or replace function ps_clean_available_slots(p_service_id uuid, p_date date)
returns table (cleaner_id uuid, free_start timestamptz, free_end timestamptz)
language sql stable security definer set search_path = public as $$
  with qualified_cleaners as (
    select distinct c.id
    from "PS_CLEAN_cleaners" c
    join "PS_CLEAN_cleaner_services" cs on cs.cleaner_id = c.id
    join "PS_CLEAN_services" s on s.id = cs.service_id
    where cs.service_id = p_service_id and c.is_active and c.business_id = s.business_id
  ),
  working as (
    select wh.cleaner_id,
           tstzrange(
             (p_date::text || ' ' || wh.start_time::text)::timestamp at time zone wh.timezone,
             (p_date::text || ' ' || wh.end_time::text)::timestamp at time zone wh.timezone,
             '[)'
           ) as rng
    from "PS_CLEAN_cleaner_working_hours" wh
    where wh.cleaner_id in (select id from qualified_cleaners)
      and wh.day_of_week = extract(dow from p_date)::smallint
  ),
  working_agg as (
    select cleaner_id, range_agg(rng) as ranges
    from working
    group by cleaner_id
  ),
  busy as (
    select b.cleaner_id, b.padded_range as rng
    from "PS_CLEAN_bookings" b
    where b.cleaner_id in (select id from qualified_cleaners)
      and b.status <> 'cancelled'
      and b.padded_range && tstzrange(p_date::timestamp - interval '1 day', p_date::timestamp + interval '2 days')
    union all
    select t.cleaner_id, tstzrange(t.starts_at, t.ends_at) as rng
    from "PS_CLEAN_cleaner_time_off" t
    where t.cleaner_id in (select id from qualified_cleaners)
      and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_date::timestamp - interval '1 day', p_date::timestamp + interval '2 days')
  ),
  busy_agg as (
    select cleaner_id, range_agg(rng) as ranges
    from busy
    group by cleaner_id
  )
  select w.cleaner_id, lower(r), upper(r)
  from working_agg w
  left join busy_agg b on b.cleaner_id = w.cleaner_id
  cross join lateral unnest(
    case when b.ranges is null then w.ranges else w.ranges - b.ranges end
  ) as r
  order by w.cleaner_id, lower(r);
$$;

create or replace function ps_clean_create_booking(
  p_customer_id uuid,
  p_cleaner_id uuid,
  p_service_id uuid,
  p_address_id uuid,
  p_starts_at timestamptz,
  p_notes text default null,
  p_addon_ids uuid[] default '{}'::uuid[],
  p_wants_meet_cleaner_first boolean default false,
  p_parking_available boolean default false,
  p_has_pets boolean default false,
  p_access_method text default 'let_in',
  p_room_selections jsonb default '[]'::jsonb
)
returns "PS_CLEAN_bookings"
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if p_access_method not in ('keys', 'let_in') then
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

  -- Every referenced row must belong to the SAME business as the service —
  -- this is what stops a customer/cleaner/address from one business ever
  -- being wired into a booking for another.
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

      v_calc_total := v_calc_total + v_quantity * v_room_type.price_per_unit_pence;
      v_extra_minutes := v_extra_minutes + v_quantity * v_room_type.minutes_per_unit;
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
      raise exception 'That slot was just taken — please pick another time' using errcode = '23P01';
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
        v_business_id, v_booking.id, v_room_type.id, v_room_type.name, v_room_type.price_per_unit_pence,
        v_quantity, v_quantity * v_room_type.price_per_unit_pence
      );
    end loop;
  end if;

  return v_booking;
end;
$function$;

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

  if not ps_clean_is_admin_for(v_booking.business_id)
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

create or replace function ps_clean_create_review(
  p_booking_id uuid,
  p_rating smallint,
  p_comment text default null
)
returns "PS_CLEAN_reviews"
language plpgsql security definer set search_path = public as $$
declare
  v_booking "PS_CLEAN_bookings";
  v_review "PS_CLEAN_reviews";
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;

  select * into v_booking from "PS_CLEAN_bookings" where id = p_booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if ps_clean_current_customer_id() is null or v_booking.customer_id is distinct from ps_clean_current_customer_id() then
    raise exception 'Not your booking' using errcode = '42501';
  end if;

  if v_booking.status <> 'completed' then
    raise exception 'Can only review a completed clean' using errcode = '22023';
  end if;

  begin
    insert into "PS_CLEAN_reviews" (business_id, booking_id, customer_id, cleaner_id, rating, comment)
    values (v_booking.business_id, p_booking_id, v_booking.customer_id, v_booking.cleaner_id, p_rating, p_comment)
    returning * into v_review;
  exception
    when unique_violation then
      raise exception 'This booking already has a review' using errcode = '23505';
  end;

  return v_review;
end;
$$;

create or replace function ps_clean_award_completion_credits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_referral_bonus_pence constant integer := 1000;
  v_referrer_id uuid;
  v_prior_completed integer;
  v_completed_count integer;
begin
  if new.status <> 'completed' or (tg_op = 'UPDATE' and old.status = 'completed') then
    return new;
  end if;

  if not exists (
    select 1 from "PS_CLEAN_customer_credits"
    where customer_id = new.customer_id and reason = 'referred_signup_bonus'
  ) then
    select referred_by_customer_id into v_referrer_id from "PS_CLEAN_customers" where id = new.customer_id;
    if v_referrer_id is not null then
      select count(*) into v_prior_completed
      from "PS_CLEAN_bookings"
      where customer_id = new.customer_id and status = 'completed';

      if v_prior_completed = 1 then
        insert into "PS_CLEAN_customer_credits" (business_id, customer_id, amount_pence, reason, related_booking_id)
        values (new.business_id, v_referrer_id, v_referral_bonus_pence, 'referral_bonus', new.id);
        insert into "PS_CLEAN_customer_credits" (business_id, customer_id, amount_pence, reason, related_booking_id)
        values (new.business_id, new.customer_id, v_referral_bonus_pence, 'referred_signup_bonus', new.id);
      end if;
    end if;
  end if;

  if not exists (
    select 1 from "PS_CLEAN_customer_credits"
    where related_booking_id = new.id and reason = 'loyalty_reward'
  ) then
    select count(*) into v_completed_count
    from "PS_CLEAN_bookings"
    where customer_id = new.customer_id and status = 'completed';

    if v_completed_count > 0 and v_completed_count % 5 = 0 then
      insert into "PS_CLEAN_customer_credits" (business_id, customer_id, amount_pence, reason, related_booking_id)
      values (new.business_id, new.customer_id, round(new.price_pence / 2.0), 'loyalty_reward', new.id);
    end if;
  end if;

  return new;
end;
$$;

create or replace function ps_clean_redeem_credit(p_booking_id uuid, p_amount_pence integer)
returns "PS_CLEAN_bookings"
language plpgsql security definer set search_path = public as $$
declare
  v_booking "PS_CLEAN_bookings";
  v_balance integer;
begin
  if p_amount_pence <= 0 then
    raise exception 'Amount must be positive' using errcode = '22023';
  end if;

  select * into v_booking from "PS_CLEAN_bookings" where id = p_booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if ps_clean_current_customer_id() is null or v_booking.customer_id is distinct from ps_clean_current_customer_id() then
    raise exception 'Not your booking' using errcode = '42501';
  end if;

  if v_booking.status <> 'pending_payment' then
    raise exception 'Credit can only be applied before payment' using errcode = '22023';
  end if;

  if p_amount_pence > v_booking.price_pence then
    raise exception 'Cannot redeem more than the booking total' using errcode = '22023';
  end if;

  select ps_clean_customer_credit_balance(v_booking.customer_id) into v_balance;
  if p_amount_pence > v_balance then
    raise exception 'Insufficient credit balance' using errcode = '22023';
  end if;

  insert into "PS_CLEAN_customer_credits" (business_id, customer_id, amount_pence, reason, related_booking_id)
  values (v_booking.business_id, v_booking.customer_id, -p_amount_pence, 'redeemed', p_booking_id);

  update "PS_CLEAN_bookings"
  set price_pence = price_pence - p_amount_pence,
      deposit_pence = least(deposit_pence, price_pence - p_amount_pence),
      updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

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

  insert into "PS_CLEAN_recurring_bookings" (business_id, customer_id, cleaner_id, service_id, address_id, frequency, time_of_day, next_occurrence_date)
  values (v_booking.business_id, v_booking.customer_id, v_booking.cleaner_id, v_booking.service_id, v_booking.address_id, p_frequency, v_local_time, v_next_date)
  returning * into v_recurring;

  update "PS_CLEAN_bookings" set recurring_booking_id = v_recurring.id where id = p_booking_id;

  return v_recurring;
end;
$$;

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

  update "PS_CLEAN_bookings"
  set status = 'completed', updated_at = now()
  where id = p_booking_id;
end;
$$;
