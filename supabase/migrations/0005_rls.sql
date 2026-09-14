-- PS Cleaning: Row Level Security.
--
-- Pattern: public/anon gets read access only to genuinely non-sensitive,
-- catalog-style data (active services, active cleaner profiles). Anything
-- that touches a schedule (working hours, time off, bookings) is reachable
-- by the public only through the SECURITY DEFINER RPCs in 0004_functions.sql,
-- never by direct table access — those RPCs perform their own auth checks.
-- Admins (PS_CLEAN_admin_users) can do everything, via ps_clean_is_admin().

alter table "PS_CLEAN_cleaners" enable row level security;
alter table "PS_CLEAN_services" enable row level security;
alter table "PS_CLEAN_cleaner_services" enable row level security;
alter table "PS_CLEAN_cleaner_working_hours" enable row level security;
alter table "PS_CLEAN_cleaner_time_off" enable row level security;
alter table "PS_CLEAN_customers" enable row level security;
alter table "PS_CLEAN_customer_addresses" enable row level security;
alter table "PS_CLEAN_bookings" enable row level security;
alter table "PS_CLEAN_payments" enable row level security;
alter table "PS_CLEAN_notifications_log" enable row level security;
alter table "PS_CLEAN_admin_users" enable row level security;
alter table "PS_CLEAN_business_settings" enable row level security;

-- cleaners: public sees active profiles (for the booking picker); admin sees/edits all.
create policy "cleaners public read active" on "PS_CLEAN_cleaners"
  for select using (is_active or ps_clean_is_admin());
create policy "cleaners admin write" on "PS_CLEAN_cleaners"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

-- services: same shape as cleaners.
create policy "services public read active" on "PS_CLEAN_services"
  for select using (is_active or ps_clean_is_admin());
create policy "services admin write" on "PS_CLEAN_services"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

-- cleaner_services: a join table over two already-public catalogs, so it's
-- public-readable too (it's how the UI knows which cleaners offer a service).
create policy "cleaner_services public read" on "PS_CLEAN_cleaner_services"
  for select using (true);
create policy "cleaner_services admin write" on "PS_CLEAN_cleaner_services"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

-- working hours & time off: schedule internals — no public policy at all.
-- The public booking UI learns availability only via ps_clean_available_slots().
create policy "working_hours admin only" on "PS_CLEAN_cleaner_working_hours"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());
create policy "time_off admin only" on "PS_CLEAN_cleaner_time_off"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

-- customers: a signed-in customer manages only their own profile row.
create policy "customers read own" on "PS_CLEAN_customers"
  for select using (auth.uid() = user_id or ps_clean_is_admin());
create policy "customers insert own" on "PS_CLEAN_customers"
  for insert with check (auth.uid() = user_id);
create policy "customers update own" on "PS_CLEAN_customers"
  for update using (auth.uid() = user_id or ps_clean_is_admin())
  with check (auth.uid() = user_id or ps_clean_is_admin());
create policy "customers admin all" on "PS_CLEAN_customers"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

-- customer_addresses: owned via the parent customer row.
create policy "addresses read own" on "PS_CLEAN_customer_addresses"
  for select using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin()
  );
create policy "addresses write own" on "PS_CLEAN_customer_addresses"
  for all using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin()
  )
  with check (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin()
  );

-- bookings: customers can only ever SELECT their own rows directly — every
-- write path is one of the RPCs in 0004_functions.sql, which check
-- ownership themselves and run as SECURITY DEFINER. Admins get direct
-- write access too, for manual overrides that bypass the RPC's own
-- working-hours validation (see ROADMAP.md — audit-logging admin overrides
-- is a good next step once this is used in anger).
create policy "bookings read own" on "PS_CLEAN_bookings"
  for select using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin()
  );
create policy "bookings admin write" on "PS_CLEAN_bookings"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

-- payments: read-only for the owning customer (via their booking); all
-- writes come from the service-role client in the Stripe webhook handler,
-- which bypasses RLS entirely, so no customer write policy exists at all.
create policy "payments read own" on "PS_CLEAN_payments"
  for select using (
    booking_id in (
      select b.id from "PS_CLEAN_bookings" b
      join "PS_CLEAN_customers" c on c.id = b.customer_id
      where c.user_id = auth.uid()
    )
    or ps_clean_is_admin()
  );
create policy "payments admin write" on "PS_CLEAN_payments"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

-- notifications_log: internal/ops data, admin only.
create policy "notifications admin only" on "PS_CLEAN_notifications_log"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

-- admin_users: any admin can see the admin list; only an owner can change it
-- (mirrors the "staff readable by staff / writable by owner" shape used
-- elsewhere in this workspace's Supabase projects).
create policy "admin_users read by admin" on "PS_CLEAN_admin_users"
  for select using (ps_clean_is_admin());
create policy "admin_users write by owner" on "PS_CLEAN_admin_users"
  for all using (ps_clean_is_owner()) with check (ps_clean_is_owner());

-- business_settings: public read (shown on the site), owner-only write.
create policy "business_settings public read" on "PS_CLEAN_business_settings"
  for select using (true);
create policy "business_settings owner write" on "PS_CLEAN_business_settings"
  for all using (ps_clean_is_owner()) with check (ps_clean_is_owner());
