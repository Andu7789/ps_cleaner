-- Growth tier: add-on services at checkout (upsells).
create table "PS_CLEAN_addons" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_pence integer not null check (price_pence >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Which add-ons are offered for which service — not every add-on makes
-- sense for every service (e.g. "inside oven clean" on an office clean).
create table "PS_CLEAN_service_addons" (
  service_id uuid not null references "PS_CLEAN_services"(id) on delete cascade,
  addon_id uuid not null references "PS_CLEAN_addons"(id) on delete cascade,
  primary key (service_id, addon_id)
);

create index idx_ps_clean_service_addons_addon on "PS_CLEAN_service_addons"(addon_id);

-- What was actually purchased with a booking, at the price charged then —
-- same "snapshot, don't re-read live" principle as PS_CLEAN_bookings'
-- own price_pence (see 0002's comment on that column).
create table "PS_CLEAN_booking_addons" (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references "PS_CLEAN_bookings"(id) on delete cascade,
  addon_id uuid references "PS_CLEAN_addons"(id) on delete set null,
  name text not null,
  price_pence integer not null check (price_pence >= 0)
);

create index idx_ps_clean_booking_addons_booking on "PS_CLEAN_booking_addons"(booking_id);

alter table "PS_CLEAN_addons" enable row level security;
alter table "PS_CLEAN_service_addons" enable row level security;
alter table "PS_CLEAN_booking_addons" enable row level security;

-- Same public-catalog shape as PS_CLEAN_services/cleaners.
create policy "addons public read active" on "PS_CLEAN_addons"
  for select using (is_active or ps_clean_is_admin());
create policy "addons admin write" on "PS_CLEAN_addons"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

create policy "service_addons public read" on "PS_CLEAN_service_addons"
  for select using (true);
create policy "service_addons admin write" on "PS_CLEAN_service_addons"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

-- booking_addons: same visibility as the parent booking — owning customer
-- or admin. No direct write policy for customers: only written by
-- ps_clean_create_booking (SECURITY DEFINER), same as bookings themselves.
create policy "booking_addons read own" on "PS_CLEAN_booking_addons"
  for select using (
    booking_id in (
      select b.id from "PS_CLEAN_bookings" b
      join "PS_CLEAN_customers" c on c.id = b.customer_id
      where c.user_id = auth.uid()
    )
    or ps_clean_is_admin()
  );
create policy "booking_addons admin write" on "PS_CLEAN_booking_addons"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());
