-- PS_CLEAN_businesses (0029) shipped read-only, matching where Root Cafe's
-- own tenant table still is — but this app already HAD a working
-- "business owner edits their business settings" page before this
-- migration, and dropping that would be a regression, not a deferral.
-- Owner-only, using the row's own id as its own "business_id" (a business
-- row IS the business it's scoping access to).
create policy "businesses owner write" on "PS_CLEAN_businesses"
  for update using (ps_clean_is_owner_for(id)) with check (ps_clean_is_owner_for(id));
