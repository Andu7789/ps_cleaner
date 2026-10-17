-- Public read of services and cleaners showed inactive rows to ANY admin,
-- including admins of other businesses. Scope the admin branch to the
-- row's own business.

drop policy if exists "services public read active" on "PS_CLEAN_services";
create policy "services public read active" on "PS_CLEAN_services"
  for select using (is_active or ps_clean_is_admin_for(business_id));

drop policy if exists "cleaners public read active" on "PS_CLEAN_cleaners";
create policy "cleaners public read active" on "PS_CLEAN_cleaners"
  for select using (is_active or ps_clean_is_admin_for(business_id));
