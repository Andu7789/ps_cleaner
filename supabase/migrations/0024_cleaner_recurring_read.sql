-- Cleaner portal expansion: cleaners need to see their own recurring
-- series (for the "regular customers" view) — no read policy existed for
-- them at all before this (only the owning customer or an admin could
-- read PS_CLEAN_recurring_bookings, see migration 0018). Direct column
-- check, same as "bookings read own as cleaner" in migration 0021 — no
-- subquery back into this table, so no recursion risk.
create policy "recurring_bookings read own as cleaner" on "PS_CLEAN_recurring_bookings"
  for select using (cleaner_id = ps_clean_current_cleaner_id());
