-- PS Cleaning: helper functions and the booking RPCs.
--
-- Table names are mixed-case (PS_CLEAN_*) and therefore double-quoted
-- everywhere below — Postgres folds unquoted identifiers to lowercase, so
-- an unquoted reference would silently look for a different, nonexistent
-- table rather than erroring obviously.

create or replace function ps_clean_is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from "PS_CLEAN_admin_users" where user_id = auth.uid()
  );
$$;

create or replace function ps_clean_current_customer_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id from "PS_CLEAN_customers" where user_id = auth.uid();
$$;

-- SECURITY DEFINER for the same reason as ps_clean_is_admin(): a policy
-- that needs "is this caller an owner" must check it through a function
-- that bypasses RLS internally, not a raw subquery against
-- PS_CLEAN_admin_users — a raw subquery re-triggers that table's OWN
-- policies (including this same owner check, since it applies to SELECT
-- too), which is infinite recursion. See DECISIONS.md #8.
create or replace function ps_clean_is_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from "PS_CLEAN_admin_users" where user_id = auth.uid() and role = 'owner'
  );
$$;

-- Free (unbooked, in-hours, not-timed-off) ranges per cleaner qualified for
-- a service on a given date. Built with multirange subtraction (working
-- hours minus busy time) in one set-based query rather than looping
-- candidate slots one at a time. SECURITY DEFINER because it reads
-- PS_CLEAN_bookings and PS_CLEAN_cleaner_time_off, neither of which is
-- publicly readable directly (see 0005_rls.sql) — this function is the
-- sanctioned way the public booking UI learns what's free.
create or replace function ps_clean_available_slots(p_service_id uuid, p_date date)
returns table (cleaner_id uuid, free_start timestamptz, free_end timestamptz)
language sql stable security definer set search_path = public as $$
  with qualified_cleaners as (
    select distinct c.id
    from "PS_CLEAN_cleaners" c
    join "PS_CLEAN_cleaner_services" cs on cs.cleaner_id = c.id
    where cs.service_id = p_service_id and c.is_active
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
  -- Prefilter window is deliberately generous (a day either side) rather
  -- than timezone-exact: it only needs to not miss rows, since the actual
  -- overlap math happens in the subtraction below against working_agg,
  -- which IS computed in each cleaner's own timezone.
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

grant execute on function ps_clean_available_slots(uuid, date) to anon, authenticated;

-- Creates a booking, validated against working hours and time-off, with the
-- EXCLUDE constraint on PS_CLEAN_bookings as the final, race-proof guard
-- (see DECISIONS.md #4). The advisory lock is defense-in-depth for the
-- working-hours/time-off checks specifically, which — unlike the overlap
-- check — aren't expressible as a same-table constraint the database can
-- enforce on its own; it serializes concurrent attempts for the same
-- cleaner on the same day so two requests can't both pass validation
-- against a schedule that's simultaneously changing under them.
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
  -- NULL-safe on purpose: ps_clean_current_customer_id() returns NULL for
  -- anyone with no matching PS_CLEAN_customers row (unauthenticated, or
  -- authenticated but not yet a customer). A plain `<>` against NULL
  -- evaluates to NULL, and PL/pgSQL's IF treats a NULL condition as false —
  -- so the ownership check would silently never fire and let an
  -- unauthenticated caller through. Found by the test agent; see
  -- DECISIONS.md.
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

  -- Serialize other booking attempts for this cleaner on this calendar day
  -- (in UTC — a coarse but stable key, fine for a lock scope) while the
  -- working-hours/time-off checks below run.
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

grant execute on function ps_clean_create_booking(uuid, uuid, uuid, uuid, timestamptz, text) to authenticated;

-- Cancels a booking. Callable by the owning customer or an admin; frees the
-- slot immediately since the EXCLUDE constraint's WHERE clause ignores
-- cancelled rows.
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

  -- Same NULL-safety fix as ps_clean_create_booking above.
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

grant execute on function ps_clean_cancel_booking(uuid, text) to authenticated;
