-- Real security bug found while smoke-testing the cleaner photo upload
-- feature: this shared Supabase project has a pre-existing, project-wide
-- "Allow all" policy set on storage.objects (INSERT/UPDATE/DELETE
-- with_check/using = true, SELECT using = true, role public) that predates
-- PS Cleaning and applies across every bucket in the project. Postgres ORs
-- all *permissive* policies together, so that blanket policy silently made
-- every bucket-scoped policy in migration 0020 moot — confirmed live: a
-- cleaner (Marcus) was able to upload a file straight into another
-- cleaner's (Jane's) booking-photo folder via a direct REST call, which
-- should have been rejected.
--
-- Cannot safely remove or narrow that "Allow all" policy here — other,
-- unrelated apps in this shared project may depend on it (see DECISIONS.md
-- #1 and the "Flagged for review" section for the general shape of this
-- problem: project-wide settings are out of this app's ownership). The
-- correct tool instead is a RESTRICTIVE policy: Postgres ANDs restrictive
-- policies against the OR'd set of permissive ones, so a restrictive
-- policy scoped to `bucket_id = 'ps-clean-booking-photos'` can enforce
-- real ownership for this app's own bucket without touching, weakening, or
-- even referencing the shared policy at all. The `bucket_id <> '...' or
-- ...` shape makes it a no-op for every other bucket in the project.
create policy "ps_clean_booking_photos insert guard" on storage.objects
  as restrictive
  for insert
  with check (
    bucket_id <> 'ps-clean-booking-photos'
    or ps_clean_is_admin()
    or exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1]
        and b.cleaner_id = ps_clean_current_cleaner_id()
    )
  );

create policy "ps_clean_booking_photos select guard" on storage.objects
  as restrictive
  for select
  using (
    bucket_id <> 'ps-clean-booking-photos'
    or ps_clean_is_admin()
    or exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1]
        and (b.cleaner_id = ps_clean_current_cleaner_id() or b.customer_id = ps_clean_current_customer_id())
    )
  );

create policy "ps_clean_booking_photos update guard" on storage.objects
  as restrictive
  for update
  using (
    bucket_id <> 'ps-clean-booking-photos'
    or ps_clean_is_admin()
    or exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1]
        and b.cleaner_id = ps_clean_current_cleaner_id()
    )
  );

create policy "ps_clean_booking_photos delete guard" on storage.objects
  as restrictive
  for delete
  using (
    bucket_id <> 'ps-clean-booking-photos'
    or ps_clean_is_admin()
    or exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1]
        and b.cleaner_id = ps_clean_current_cleaner_id()
    )
  );
