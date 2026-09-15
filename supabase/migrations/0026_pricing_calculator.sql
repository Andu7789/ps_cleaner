-- "Build your experience" pricing calculator: a customer enters a count
-- per room type (Bedroom, Bathroom, whatever the admin has configured)
-- and sees the price update live, instead of picking a single flat
-- price. Off by default per service (admin opts a service in via
-- use_calculator, not offered automatically), and the room types
-- themselves are a global, admin-managed catalog — add/rename/deactivate
-- any of them, same "public read active / admin write" shape as
-- PS_CLEAN_addons (migration 0012), which this mirrors closely.
--
-- Deliberately price-only, not duration-only: adjusting a job's actual
-- duration by room count would mean ps_clean_available_slots() also
-- needs those counts to compute correct free windows — a much larger,
-- riskier change to the core conflict-checking engine (see DECISIONS.md
-- #4) to get right in one pass. The calculator changes what a job
-- costs, not how long the cleaner is booked for, so nothing about slot
-- availability or double-booking prevention changes at all.
alter table "PS_CLEAN_services"
  add column use_calculator boolean not null default false;

create table "PS_CLEAN_calculator_room_types" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_per_unit_pence integer not null check (price_per_unit_pence >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- What was actually selected at booking time, at the price charged then —
-- same snapshot principle as PS_CLEAN_booking_addons: room_type_id is
-- nullable + ON DELETE SET NULL so deleting a room type later never
-- corrupts a historical booking's record of what was actually charged.
create table "PS_CLEAN_booking_calculator_selections" (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references "PS_CLEAN_bookings"(id) on delete cascade,
  room_type_id uuid references "PS_CLEAN_calculator_room_types"(id) on delete set null,
  room_type_name text not null,
  price_per_unit_pence integer not null check (price_per_unit_pence >= 0),
  quantity integer not null check (quantity >= 0),
  line_total_pence integer not null check (line_total_pence >= 0)
);

create index idx_ps_clean_booking_calc_selections_booking on "PS_CLEAN_booking_calculator_selections"(booking_id);

alter table "PS_CLEAN_calculator_room_types" enable row level security;
alter table "PS_CLEAN_booking_calculator_selections" enable row level security;

create policy "calculator_room_types public read active" on "PS_CLEAN_calculator_room_types"
  for select using (is_active or ps_clean_is_admin());
create policy "calculator_room_types admin write" on "PS_CLEAN_calculator_room_types"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

create policy "booking_calc_selections read own as customer" on "PS_CLEAN_booking_calculator_selections"
  for select using (
    booking_id in (
      select b.id from "PS_CLEAN_bookings" b
      join "PS_CLEAN_customers" c on c.id = b.customer_id
      where c.user_id = auth.uid()
    )
    or ps_clean_is_admin()
  );
create policy "booking_calc_selections read own as cleaner" on "PS_CLEAN_booking_calculator_selections"
  for select using (
    exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id = booking_id and b.cleaner_id = ps_clean_current_cleaner_id()
    )
  );
create policy "booking_calc_selections admin write" on "PS_CLEAN_booking_calculator_selections"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

-- Same drop-then-recreate pattern as migrations 0025/earlier (and the
-- overload bug they reference) — a different parameter list via CREATE OR
-- REPLACE would create a second overload, not replace this one.
drop function if exists ps_clean_create_booking(uuid, uuid, uuid, uuid, timestamptz, text, uuid[], boolean, boolean, boolean, text);

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
  v_selection jsonb;
  v_room_type "PS_CLEAN_calculator_room_types";
  v_quantity integer;
begin
  if p_access_method not in ('keys', 'let_in') then
    raise exception 'Invalid access method' using errcode = '22023';
  end if;

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

  -- Calculator adjustment only ever applies when the service has actually
  -- opted in — selections sent for a non-calculator service are silently
  -- ignored rather than erroring, since price is always computed here,
  -- server-side, never trusted from the client either way.
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
      where id = (v_selection->>'room_type_id')::uuid and is_active;
      if not found then
        raise exception 'Unknown or inactive room type' using errcode = '22023';
      end if;

      v_calc_total := v_calc_total + v_quantity * v_room_type.price_per_unit_pence;
    end loop;
  end if;

  v_price_pence := v_service.price_pence + v_addon_total + v_calc_total;

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
      price_pence, deposit_pence, notes,
      wants_meet_cleaner_first, parking_available, has_pets, access_method
    ) values (
      p_customer_id, p_cleaner_id, p_service_id, p_address_id,
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
      insert into "PS_CLEAN_booking_addons" (booking_id, addon_id, name, price_pence)
      values (v_booking.id, v_addon.id, v_addon.name, v_addon.price_pence);
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
        (booking_id, room_type_id, room_type_name, price_per_unit_pence, quantity, line_total_pence)
      values (
        v_booking.id, v_room_type.id, v_room_type.name, v_room_type.price_per_unit_pence,
        v_quantity, v_quantity * v_room_type.price_per_unit_pence
      );
    end loop;
  end if;

  return v_booking;
end;
$function$;

grant execute on function ps_clean_create_booking(uuid, uuid, uuid, uuid, timestamptz, text, uuid[], boolean, boolean, boolean, text, jsonb) to authenticated;
