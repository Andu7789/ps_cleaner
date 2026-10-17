-- Deletes a business and everything that belongs to it, in one transaction.
-- The foreign keys from business_id are NO ACTION and bookings restrict
-- deleting their cleaners, customers and services, so rows have to go
-- children first. Server only: callable by the service role, never by
-- anon or signed in users.
--
-- Returns what the app needs to finish the clean up outside the database:
-- sign in accounts that belonged only to this business, Stripe customers,
-- the connected Stripe account and the stored photo files.
create or replace function ps_clean_delete_business(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_account text;
  v_users uuid[];
  v_orphans uuid[];
  v_stripe_customers text[];
  v_photos text[];
  v_bookings int;
  v_customers int;
  v_cleaners int;
  v_services int;
  v_payments int;
begin
  select slug, stripe_connect_account_id into v_slug, v_account
  from "PS_CLEAN_businesses" where id = p_business_id;
  if v_slug is null then
    raise exception 'Business not found';
  end if;
  if v_slug = 'ps-clean' then
    raise exception 'The main business cannot be deleted';
  end if;

  select coalesce(array_agg(distinct u), '{}') into v_users from (
    select user_id as u from "PS_CLEAN_customers" where business_id = p_business_id and user_id is not null
    union select user_id from "PS_CLEAN_cleaners" where business_id = p_business_id and user_id is not null
    union select user_id from "PS_CLEAN_admin_users" where business_id = p_business_id and user_id is not null
  ) s;
  select coalesce(array_agg(stripe_customer_id), '{}') into v_stripe_customers
    from "PS_CLEAN_customers" where business_id = p_business_id and stripe_customer_id is not null;
  select coalesce(array_agg(storage_path), '{}') into v_photos
    from "PS_CLEAN_booking_photos" where business_id = p_business_id;

  select count(*) into v_bookings from "PS_CLEAN_bookings" where business_id = p_business_id;
  select count(*) into v_customers from "PS_CLEAN_customers" where business_id = p_business_id;
  select count(*) into v_cleaners from "PS_CLEAN_cleaners" where business_id = p_business_id;
  select count(*) into v_services from "PS_CLEAN_services" where business_id = p_business_id;
  select count(*) into v_payments from "PS_CLEAN_payments" where business_id = p_business_id;

  delete from "PS_CLEAN_cleaner_invoice_items" where business_id = p_business_id;
  delete from "PS_CLEAN_cleaner_invoices" where business_id = p_business_id;
  delete from "PS_CLEAN_cleaner_payouts" where business_id = p_business_id;
  delete from "PS_CLEAN_booking_photos" where business_id = p_business_id;
  delete from "PS_CLEAN_booking_calculator_selections" where business_id = p_business_id;
  delete from "PS_CLEAN_booking_addons" where business_id = p_business_id;
  delete from "PS_CLEAN_payments" where business_id = p_business_id;
  delete from "PS_CLEAN_notifications_log" where business_id = p_business_id;
  delete from "PS_CLEAN_admin_change_log" where business_id = p_business_id;
  delete from "PS_CLEAN_reviews" where business_id = p_business_id;
  delete from "PS_CLEAN_customer_credits" where business_id = p_business_id;
  delete from "PS_CLEAN_bookings" where business_id = p_business_id;
  delete from "PS_CLEAN_recurring_bookings" where business_id = p_business_id;
  delete from "PS_CLEAN_waitlist_entries" where business_id = p_business_id;
  delete from "PS_CLEAN_cleaner_services" where business_id = p_business_id;
  delete from "PS_CLEAN_cleaner_time_off" where business_id = p_business_id;
  delete from "PS_CLEAN_cleaner_working_hours" where business_id = p_business_id;
  delete from "PS_CLEAN_push_subscriptions" where business_id = p_business_id;
  delete from "PS_CLEAN_service_addons" where business_id = p_business_id;
  delete from "PS_CLEAN_addons" where business_id = p_business_id;
  delete from "PS_CLEAN_calculator_room_types" where business_id = p_business_id;
  delete from "PS_CLEAN_services" where business_id = p_business_id;
  delete from "PS_CLEAN_cleaners" where business_id = p_business_id;
  delete from "PS_CLEAN_customer_addresses" where business_id = p_business_id;
  delete from "PS_CLEAN_customers" where business_id = p_business_id;
  delete from "PS_CLEAN_admin_users" where business_id = p_business_id;
  delete from "PS_CLEAN_businesses" where id = p_business_id;

  -- Only sign in accounts with nothing left anywhere else (another business,
  -- the platform admin list) are safe for the app to delete.
  select coalesce(array_agg(u), '{}') into v_orphans from unnest(v_users) u
  where not exists (select 1 from "PS_CLEAN_customers" where user_id = u)
    and not exists (select 1 from "PS_CLEAN_cleaners" where user_id = u)
    and not exists (select 1 from "PS_CLEAN_admin_users" where user_id = u)
    and not exists (select 1 from "PS_CLEAN_platform_admins" where user_id = u);

  return jsonb_build_object(
    'slug', v_slug,
    'bookings', v_bookings,
    'customers', v_customers,
    'cleaners', v_cleaners,
    'services', v_services,
    'payments', v_payments,
    'orphan_user_ids', to_jsonb(v_orphans),
    'stripe_customer_ids', to_jsonb(v_stripe_customers),
    'stripe_account_id', v_account,
    'photo_paths', to_jsonb(v_photos)
  );
end;
$$;

revoke all on function ps_clean_delete_business(uuid) from public, anon, authenticated;
grant execute on function ps_clean_delete_business(uuid) to service_role;
