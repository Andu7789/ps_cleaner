-- Pro tier: cleaner-facing mobile view (today's jobs, mark complete, photo upload)
--
-- Cleaners were already designed to have a nullable `user_id` in Core scope
-- (see DECISIONS.md #3) specifically so this didn't require a schema
-- migration to "turn a cleaner into a logged-in user" — just a helper
-- function analogous to ps_clean_current_customer_id().

create or replace function ps_clean_current_cleaner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from "PS_CLEAN_cleaners" where user_id = auth.uid();
$$;

grant execute on function ps_clean_current_cleaner_id() to authenticated;

-- A cleaner can mark their own confirmed booking complete. This is its own
-- SECURITY DEFINER RPC rather than a blanket RLS UPDATE policy on
-- PS_CLEAN_bookings, because RLS can't restrict *which columns* a policy
-- lets through — a cleaner should only ever be able to flip status
-- confirmed -> completed on a job that's actually theirs, never touch
-- price/customer/anything else. Same pattern as every other customer- or
-- cleaner-facing mutation in this schema (ps_clean_create_booking etc).
create or replace function ps_clean_cleaner_complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleaner_id uuid := ps_clean_current_cleaner_id();
  v_booking "PS_CLEAN_bookings"%rowtype;
begin
  if v_cleaner_id is null then
    raise exception 'Not a cleaner' using errcode = '42501';
  end if;

  select * into v_booking from "PS_CLEAN_bookings" where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if v_booking.cleaner_id is distinct from v_cleaner_id then
    raise exception 'Not your booking' using errcode = '42501';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'Only a confirmed booking can be marked complete' using errcode = '22023';
  end if;

  update "PS_CLEAN_bookings"
  set status = 'completed', updated_at = now()
  where id = p_booking_id;
  -- Fires ps_clean_award_completion_credits() the same as any other path
  -- that completes a booking (admin override, etc) — see DECISIONS.md,
  -- credits are a trigger on the status column, not per-code-path logic.
end;
$$;

grant execute on function ps_clean_cleaner_complete_booking(uuid) to authenticated;

-- Before/after photos. Named PS_CLEAN_-prefixed even though it's obviously
-- this app's table, because this shared Supabase project already has an
-- unrelated bare `booking_photos` table belonging to a different app (see
-- DECISIONS.md #1) — exactly the collision the prefix convention exists to
-- avoid.
create table "PS_CLEAN_booking_photos" (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references "PS_CLEAN_bookings"(id) on delete cascade,
  kind text not null check (kind in ('before', 'after')),
  storage_path text not null,
  uploaded_by_cleaner_id uuid not null references "PS_CLEAN_cleaners"(id),
  created_at timestamptz not null default now()
);

create index on "PS_CLEAN_booking_photos" (booking_id);

alter table "PS_CLEAN_booking_photos" enable row level security;

create policy "cleaner manage own booking photos" on "PS_CLEAN_booking_photos"
  for all
  using (
    exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id = booking_id and b.cleaner_id = ps_clean_current_cleaner_id()
    )
  )
  with check (
    exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id = booking_id and b.cleaner_id = ps_clean_current_cleaner_id()
    )
  );

create policy "customer view own booking photos" on "PS_CLEAN_booking_photos"
  for select
  using (
    exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id = booking_id and b.customer_id = ps_clean_current_customer_id()
    )
  );

create policy "admin manage all booking photos" on "PS_CLEAN_booking_photos"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());

-- Storage: private bucket, objects keyed as "{booking_id}/{kind}-{ts}.jpg".
-- storage.foldername(name) splits off everything before the filename, so
-- (storage.foldername(name))[1] recovers the booking id from the path
-- without needing a separate lookup table for object ownership.
insert into storage.buckets (id, name, public)
values ('ps-clean-booking-photos', 'ps-clean-booking-photos', false)
on conflict (id) do nothing;

create policy "cleaner upload own booking photos" on storage.objects
  for insert
  with check (
    bucket_id = 'ps-clean-booking-photos'
    and exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1]
        and b.cleaner_id = ps_clean_current_cleaner_id()
    )
  );

create policy "cleaner read own booking photos" on storage.objects
  for select
  using (
    bucket_id = 'ps-clean-booking-photos'
    and exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1]
        and b.cleaner_id = ps_clean_current_cleaner_id()
    )
  );

create policy "customer read own booking photos" on storage.objects
  for select
  using (
    bucket_id = 'ps-clean-booking-photos'
    and exists (
      select 1 from "PS_CLEAN_bookings" b
      where b.id::text = (storage.foldername(name))[1]
        and b.customer_id = ps_clean_current_customer_id()
    )
  );

create policy "admin manage booking photo objects" on storage.objects
  for all
  using (bucket_id = 'ps-clean-booking-photos' and ps_clean_is_admin())
  with check (bucket_id = 'ps-clean-booking-photos' and ps_clean_is_admin());
