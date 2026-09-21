-- White-label multi-tenancy, phase 3: row-level security becomes
-- business-scoped. ps_clean_is_admin()/ps_clean_is_owner() (zero-arg,
-- unchanged, left in place) answered "is this user an admin/owner
-- anywhere" — correct for a single-tenant app, but a real cross-tenant
-- leak now (any admin of any business could read/write every other
-- business's rows). Replaced everywhere with ps_clean_is_admin_for(business_id)
-- / ps_clean_is_owner_for(business_id), which checks admin_users against a
-- SPECIFIC business — always the row's own business_id column, since every
-- table now has one. This needs no "current business" session context at
-- all: RLS evaluates it per-row.
create or replace function ps_clean_is_admin_for(target_business uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from "PS_CLEAN_admin_users"
    where user_id = auth.uid() and business_id = target_business
  );
$$;

create or replace function ps_clean_is_owner_for(target_business uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from "PS_CLEAN_admin_users"
    where user_id = auth.uid() and business_id = target_business and role = 'owner'
  );
$$;

alter table "PS_CLEAN_businesses" enable row level security; -- already enabled in 0029; no-op safety net

-- cleaners / services / cleaner_services / working_hours / time_off
drop policy "cleaners admin write" on "PS_CLEAN_cleaners";
create policy "cleaners admin write" on "PS_CLEAN_cleaners"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

drop policy "services admin write" on "PS_CLEAN_services";
create policy "services admin write" on "PS_CLEAN_services"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

drop policy "cleaner_services admin write" on "PS_CLEAN_cleaner_services";
create policy "cleaner_services admin write" on "PS_CLEAN_cleaner_services"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

drop policy "working_hours admin only" on "PS_CLEAN_cleaner_working_hours";
create policy "working_hours admin only" on "PS_CLEAN_cleaner_working_hours"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

drop policy "time_off admin only" on "PS_CLEAN_cleaner_time_off";
create policy "time_off admin only" on "PS_CLEAN_cleaner_time_off"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- customers
drop policy "customers read own" on "PS_CLEAN_customers";
create policy "customers read own" on "PS_CLEAN_customers"
  for select using (auth.uid() = user_id or ps_clean_is_admin_for(business_id));
drop policy "customers update own" on "PS_CLEAN_customers";
create policy "customers update own" on "PS_CLEAN_customers"
  for update using (auth.uid() = user_id or ps_clean_is_admin_for(business_id))
  with check (auth.uid() = user_id or ps_clean_is_admin_for(business_id));
drop policy "customers admin all" on "PS_CLEAN_customers";
create policy "customers admin all" on "PS_CLEAN_customers"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- customer_addresses
drop policy "addresses read own" on "PS_CLEAN_customer_addresses";
create policy "addresses read own" on "PS_CLEAN_customer_addresses"
  for select using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin_for(business_id)
  );
drop policy "addresses write own" on "PS_CLEAN_customer_addresses";
create policy "addresses write own" on "PS_CLEAN_customer_addresses"
  for all using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin_for(business_id)
  )
  with check (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin_for(business_id)
  );

-- bookings
drop policy "bookings read own" on "PS_CLEAN_bookings";
create policy "bookings read own" on "PS_CLEAN_bookings"
  for select using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin_for(business_id)
  );
drop policy "bookings admin write" on "PS_CLEAN_bookings";
create policy "bookings admin write" on "PS_CLEAN_bookings"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- payments
drop policy "payments read own" on "PS_CLEAN_payments";
create policy "payments read own" on "PS_CLEAN_payments"
  for select using (
    booking_id in (
      select b.id from "PS_CLEAN_bookings" b
      join "PS_CLEAN_customers" c on c.id = b.customer_id
      where c.user_id = auth.uid()
    )
    or ps_clean_is_admin_for(business_id)
  );
drop policy "payments admin write" on "PS_CLEAN_payments";
create policy "payments admin write" on "PS_CLEAN_payments"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- notifications_log
drop policy "notifications admin only" on "PS_CLEAN_notifications_log";
create policy "notifications admin only" on "PS_CLEAN_notifications_log"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- admin_users
drop policy "admin_users read by admin" on "PS_CLEAN_admin_users";
create policy "admin_users read by admin" on "PS_CLEAN_admin_users"
  for select using (ps_clean_is_admin_for(business_id));
drop policy "admin_users write by owner" on "PS_CLEAN_admin_users";
create policy "admin_users write by owner" on "PS_CLEAN_admin_users"
  for all using (ps_clean_is_owner_for(business_id)) with check (ps_clean_is_owner_for(business_id));

-- admin_change_log
drop policy "admin_change_log admin read" on "PS_CLEAN_admin_change_log";
create policy "admin_change_log admin read" on "PS_CLEAN_admin_change_log"
  for select using (ps_clean_is_admin_for(business_id));
drop policy "admin_change_log admin insert" on "PS_CLEAN_admin_change_log";
create policy "admin_change_log admin insert" on "PS_CLEAN_admin_change_log"
  for insert with check (ps_clean_is_admin_for(business_id));

-- reviews (public read stays open — non-sensitive trust signal, app filters by business)
drop policy "reviews admin all" on "PS_CLEAN_reviews";
create policy "reviews admin all" on "PS_CLEAN_reviews"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- addons / service_addons / booking_addons
drop policy "addons public read active" on "PS_CLEAN_addons";
create policy "addons public read active" on "PS_CLEAN_addons"
  for select using (is_active or ps_clean_is_admin_for(business_id));
drop policy "addons admin write" on "PS_CLEAN_addons";
create policy "addons admin write" on "PS_CLEAN_addons"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

drop policy "service_addons admin write" on "PS_CLEAN_service_addons";
create policy "service_addons admin write" on "PS_CLEAN_service_addons"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

drop policy "booking_addons read own" on "PS_CLEAN_booking_addons";
create policy "booking_addons read own" on "PS_CLEAN_booking_addons"
  for select using (
    booking_id in (
      select b.id from "PS_CLEAN_bookings" b
      join "PS_CLEAN_customers" c on c.id = b.customer_id
      where c.user_id = auth.uid()
    )
    or ps_clean_is_admin_for(business_id)
  );
drop policy "booking_addons admin write" on "PS_CLEAN_booking_addons";
create policy "booking_addons admin write" on "PS_CLEAN_booking_addons"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- customer_credits
drop policy "customer_credits read own" on "PS_CLEAN_customer_credits";
create policy "customer_credits read own" on "PS_CLEAN_customer_credits"
  for select using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin_for(business_id)
  );
drop policy "customer_credits admin write" on "PS_CLEAN_customer_credits";
create policy "customer_credits admin write" on "PS_CLEAN_customer_credits"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- cleaner_payouts
drop policy "cleaner_payouts admin only" on "PS_CLEAN_cleaner_payouts";
create policy "cleaner_payouts admin only" on "PS_CLEAN_cleaner_payouts"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- waitlist_entries
drop policy "waitlist read own" on "PS_CLEAN_waitlist_entries";
create policy "waitlist read own" on "PS_CLEAN_waitlist_entries"
  for select using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin_for(business_id)
  );
drop policy "waitlist delete own" on "PS_CLEAN_waitlist_entries";
create policy "waitlist delete own" on "PS_CLEAN_waitlist_entries"
  for delete using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin_for(business_id)
  );
drop policy "waitlist admin all" on "PS_CLEAN_waitlist_entries";
create policy "waitlist admin all" on "PS_CLEAN_waitlist_entries"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- recurring_bookings
drop policy "recurring_bookings read own" on "PS_CLEAN_recurring_bookings";
create policy "recurring_bookings read own" on "PS_CLEAN_recurring_bookings"
  for select using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin_for(business_id)
  );
drop policy "recurring_bookings update own" on "PS_CLEAN_recurring_bookings";
create policy "recurring_bookings update own" on "PS_CLEAN_recurring_bookings"
  for update using (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin_for(business_id)
  )
  with check (
    customer_id in (select id from "PS_CLEAN_customers" where user_id = auth.uid())
    or ps_clean_is_admin_for(business_id)
  );
drop policy "recurring_bookings admin all" on "PS_CLEAN_recurring_bookings";
create policy "recurring_bookings admin all" on "PS_CLEAN_recurring_bookings"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- booking_photos (table policy; storage.objects policies below)
drop policy "admin manage all booking photos" on "PS_CLEAN_booking_photos";
create policy "admin manage all booking photos" on "PS_CLEAN_booking_photos"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- storage.objects has no business_id column of its own — derive it from
-- the joined booking row instead of trusting anything from the request.
drop policy "admin manage booking photo objects" on storage.objects;
create policy "admin manage booking photo objects" on storage.objects
  for all
  using (
    bucket_id = 'ps-clean-booking-photos'
    and exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1] and ps_clean_is_admin_for(b.business_id)
    )
  )
  with check (
    bucket_id = 'ps-clean-booking-photos'
    and exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1] and ps_clean_is_admin_for(b.business_id)
    )
  );

drop policy "ps_clean_booking_photos insert guard" on storage.objects;
create policy "ps_clean_booking_photos insert guard" on storage.objects
  as restrictive
  for insert
  with check (
    bucket_id <> 'ps-clean-booking-photos'
    or exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1]
        and (b.cleaner_id = ps_clean_current_cleaner_id() or ps_clean_is_admin_for(b.business_id))
    )
  );

drop policy "ps_clean_booking_photos select guard" on storage.objects;
create policy "ps_clean_booking_photos select guard" on storage.objects
  as restrictive
  for select
  using (
    bucket_id <> 'ps-clean-booking-photos'
    or exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1]
        and (
          b.cleaner_id = ps_clean_current_cleaner_id()
          or b.customer_id = ps_clean_current_customer_id()
          or ps_clean_is_admin_for(b.business_id)
        )
    )
  );

drop policy "ps_clean_booking_photos update guard" on storage.objects;
create policy "ps_clean_booking_photos update guard" on storage.objects
  as restrictive
  for update
  using (
    bucket_id <> 'ps-clean-booking-photos'
    or exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1]
        and (b.cleaner_id = ps_clean_current_cleaner_id() or ps_clean_is_admin_for(b.business_id))
    )
  );

drop policy "ps_clean_booking_photos delete guard" on storage.objects;
create policy "ps_clean_booking_photos delete guard" on storage.objects
  as restrictive
  for delete
  using (
    bucket_id <> 'ps-clean-booking-photos'
    or exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1]
        and (b.cleaner_id = ps_clean_current_cleaner_id() or ps_clean_is_admin_for(b.business_id))
    )
  );

-- cleaner_invoices / cleaner_invoice_items
drop policy "cleaner_invoices admin all" on "PS_CLEAN_cleaner_invoices";
create policy "cleaner_invoices admin all" on "PS_CLEAN_cleaner_invoices"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

drop policy "cleaner_invoice_items admin all" on "PS_CLEAN_cleaner_invoice_items";
create policy "cleaner_invoice_items admin all" on "PS_CLEAN_cleaner_invoice_items"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

-- calculator_room_types / booking_calculator_selections
drop policy "calculator_room_types public read active" on "PS_CLEAN_calculator_room_types";
create policy "calculator_room_types public read active" on "PS_CLEAN_calculator_room_types"
  for select using (is_active or ps_clean_is_admin_for(business_id));
drop policy "calculator_room_types admin write" on "PS_CLEAN_calculator_room_types";
create policy "calculator_room_types admin write" on "PS_CLEAN_calculator_room_types"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));

drop policy "booking_calc_selections read own as customer" on "PS_CLEAN_booking_calculator_selections";
create policy "booking_calc_selections read own as customer" on "PS_CLEAN_booking_calculator_selections"
  for select using (
    booking_id in (
      select b.id from "PS_CLEAN_bookings" b
      join "PS_CLEAN_customers" c on c.id = b.customer_id
      where c.user_id = auth.uid()
    )
    or ps_clean_is_admin_for(business_id)
  );
drop policy "booking_calc_selections admin write" on "PS_CLEAN_booking_calculator_selections";
create policy "booking_calc_selections admin write" on "PS_CLEAN_booking_calculator_selections"
  for all using (ps_clean_is_admin_for(business_id)) with check (ps_clean_is_admin_for(business_id));
