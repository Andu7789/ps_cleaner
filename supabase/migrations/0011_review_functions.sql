-- Creates a review for a booking. Same pattern as ps_clean_create_booking:
-- SECURITY DEFINER RPC is the only write path for customers (no direct
-- INSERT policy on PS_CLEAN_reviews for authenticated users) since the
-- validation here — booking ownership AND booking status — needs a
-- cross-table check RLS alone can't express cleanly. NULL-safe ownership
-- check from the start (see DECISIONS.md #7 for why that matters).
create or replace function ps_clean_create_review(
  p_booking_id uuid,
  p_rating smallint,
  p_comment text default null
)
returns "PS_CLEAN_reviews"
language plpgsql security definer set search_path = public as $$
declare
  v_booking "PS_CLEAN_bookings";
  v_review "PS_CLEAN_reviews";
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;

  select * into v_booking from "PS_CLEAN_bookings" where id = p_booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if ps_clean_current_customer_id() is null or v_booking.customer_id is distinct from ps_clean_current_customer_id() then
    raise exception 'Not your booking' using errcode = '42501';
  end if;

  if v_booking.status <> 'completed' then
    raise exception 'Can only review a completed clean' using errcode = '22023';
  end if;

  begin
    insert into "PS_CLEAN_reviews" (booking_id, customer_id, cleaner_id, rating, comment)
    values (p_booking_id, v_booking.customer_id, v_booking.cleaner_id, p_rating, p_comment)
    returning * into v_review;
  exception
    when unique_violation then
      raise exception 'This booking already has a review' using errcode = '23505';
  end;

  return v_review;
end;
$$;

grant execute on function ps_clean_create_review(uuid, smallint, text) to authenticated;

-- Public aggregate used by the booking picker to show a cleaner's rating
-- without exposing individual reviewers' identities beyond what's already
-- public (see the "reviews public read" policy — reviews have no
-- customer-identifying columns anyway, but this is the one place that
-- reads them in bulk, so it's worth having as its own stable function
-- rather than every caller writing the same aggregation).
create or replace function ps_clean_cleaner_rating(p_cleaner_id uuid)
returns table (average_rating numeric, review_count bigint)
language sql stable security definer set search_path = public as $$
  select round(avg(rating)::numeric, 1), count(*)
  from "PS_CLEAN_reviews"
  where cleaner_id = p_cleaner_id;
$$;

grant execute on function ps_clean_cleaner_rating(uuid) to anon, authenticated;
