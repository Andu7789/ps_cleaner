-- Fixes infinite RLS recursion found via live browser/curl testing — see
-- DECISIONS.md #8. Applied as its own migration since 0004/0005 had already
-- been applied to the live database; both files' own source in this repo
-- has ALSO been corrected to match, so a fresh clone never sees the buggy
-- version — this file exists purely so the live database's migration
-- history matches what was actually run.
create or replace function ps_clean_is_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from "PS_CLEAN_admin_users" where user_id = auth.uid() and role = 'owner'
  );
$$;

drop policy "admin_users write by owner" on "PS_CLEAN_admin_users";
create policy "admin_users write by owner" on "PS_CLEAN_admin_users"
  for all using (ps_clean_is_owner()) with check (ps_clean_is_owner());

drop policy "business_settings owner write" on "PS_CLEAN_business_settings";
create policy "business_settings owner write" on "PS_CLEAN_business_settings"
  for all using (ps_clean_is_owner()) with check (ps_clean_is_owner());
