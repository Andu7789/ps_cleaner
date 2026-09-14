-- Supabase's security advisor flagged ps_clean_set_booking_padded_range as
-- missing `set search_path`, unlike every other ps_clean_* function. Fixed
-- here rather than by editing 0002 in place, since 0002 had already been
-- applied to the live database by the time this was caught.
create or replace function ps_clean_set_booking_padded_range()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.padded_range := tstzrange(
    new.starts_at - (new.buffer_before_minutes || ' minutes')::interval,
    new.ends_at + (new.buffer_after_minutes || ' minutes')::interval,
    '[)'
  );
  return new;
end;
$$;
