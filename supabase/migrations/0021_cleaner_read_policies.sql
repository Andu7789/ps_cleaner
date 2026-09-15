-- Cleaners had no direct SELECT access to their own jobs at all before this
-- (0005_rls.sql's "bookings read own" only covers the owning customer or an
-- admin) — needed for the cleaner portal (0020) to show "today's jobs".

create policy "bookings read own as cleaner" on "PS_CLEAN_bookings"
  for select using (cleaner_id = ps_clean_current_cleaner_id());

-- A cleaner also needs to see the customer's name/phone and the job
-- address for a booking that's theirs. This can't be a raw subquery
-- straight into PS_CLEAN_bookings on the customers/addresses policies,
-- because "bookings read own" itself subqueries PS_CLEAN_customers —
-- two tables whose policies both subquery each other directly would
-- recurse forever the same way 0008's admin_users bug did, just across
-- two tables instead of one. Routing through a SECURITY DEFINER function
-- (which runs with RLS bypassed) breaks the cycle, same fix as 0008.
create or replace function ps_clean_cleaner_can_view_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from "PS_CLEAN_bookings" b
    where b.customer_id = p_customer_id and b.cleaner_id = ps_clean_current_cleaner_id()
  );
$$;

create or replace function ps_clean_cleaner_can_view_address(p_address_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from "PS_CLEAN_bookings" b
    where b.address_id = p_address_id and b.cleaner_id = ps_clean_current_cleaner_id()
  );
$$;

create policy "cleaner view own job customers" on "PS_CLEAN_customers"
  for select using (ps_clean_cleaner_can_view_customer(id));

create policy "cleaner view own job addresses" on "PS_CLEAN_customer_addresses"
  for select using (ps_clean_cleaner_can_view_address(id));
