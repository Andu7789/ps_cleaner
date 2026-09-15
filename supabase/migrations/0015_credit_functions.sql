create or replace function ps_clean_customer_credit_balance(p_customer_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_pence), 0)::integer
  from "PS_CLEAN_customer_credits"
  where customer_id = p_customer_id;
$$;

grant execute on function ps_clean_customer_credit_balance(uuid) to authenticated;

-- Awards referral and loyalty credits the moment a booking transitions
-- INTO 'completed' — a trigger rather than app-layer logic in
-- adminSetBookingStatusAction, so this fires no matter what marks a
-- booking completed (today: only the admin action; later: a cleaner
-- "mark job done" flow, see ROADMAP.md, without needing to remember to
-- duplicate this logic there too).
create or replace function ps_clean_award_completion_credits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_referral_bonus_pence constant integer := 1000; -- £10 each side — a reasonable default, not a business-validated figure; easy to tune here.
  v_referrer_id uuid;
  v_prior_completed integer;
  v_completed_count integer;
begin
  if new.status <> 'completed' or (tg_op = 'UPDATE' and old.status = 'completed') then
    return new;
  end if;

  -- Referral bonus: only on the referred customer's FIRST completed
  -- booking, and only once ever (guarded on the referred customer's own
  -- credit row, not the referrer's, since the referrer could refer
  -- multiple people).
  if not exists (
    select 1 from "PS_CLEAN_customer_credits"
    where customer_id = new.customer_id and reason = 'referred_signup_bonus'
  ) then
    select referred_by_customer_id into v_referrer_id from "PS_CLEAN_customers" where id = new.customer_id;
    if v_referrer_id is not null then
      select count(*) into v_prior_completed
      from "PS_CLEAN_bookings"
      where customer_id = new.customer_id and status = 'completed';

      if v_prior_completed = 1 then
        insert into "PS_CLEAN_customer_credits" (customer_id, amount_pence, reason, related_booking_id)
        values (v_referrer_id, v_referral_bonus_pence, 'referral_bonus', new.id);
        insert into "PS_CLEAN_customer_credits" (customer_id, amount_pence, reason, related_booking_id)
        values (new.customer_id, v_referral_bonus_pence, 'referred_signup_bonus', new.id);
      end if;
    end if;
  end if;

  -- Loyalty reward: every 5th completed booking earns a credit worth half
  -- that booking's price, spendable on a future booking — not
  -- automatically applied to this one, since this one is already being
  -- paid for. "Book 5, 6th half price" (ROADMAP.md's example) in credit
  -- form rather than a hardcoded "the 6th booking is always 50% off" rule,
  -- since a spendable credit is more flexible (works even if their next
  -- booking isn't literally the very next one chronologically).
  if not exists (
    select 1 from "PS_CLEAN_customer_credits"
    where related_booking_id = new.id and reason = 'loyalty_reward'
  ) then
    select count(*) into v_completed_count
    from "PS_CLEAN_bookings"
    where customer_id = new.customer_id and status = 'completed';

    if v_completed_count > 0 and v_completed_count % 5 = 0 then
      insert into "PS_CLEAN_customer_credits" (customer_id, amount_pence, reason, related_booking_id)
      values (new.customer_id, round(new.price_pence / 2.0), 'loyalty_reward', new.id);
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_ps_clean_award_completion_credits
  after insert or update on "PS_CLEAN_bookings"
  for each row execute function ps_clean_award_completion_credits();

-- Applies available credit to a not-yet-paid booking. Separate step from
-- ps_clean_create_booking (called after it, before the Stripe
-- PaymentIntent is created) rather than folded into it, since credit
-- redemption and add-on selection are independent concerns a customer
-- might or might not use.
create or replace function ps_clean_redeem_credit(p_booking_id uuid, p_amount_pence integer)
returns "PS_CLEAN_bookings"
language plpgsql security definer set search_path = public as $$
declare
  v_booking "PS_CLEAN_bookings";
  v_balance integer;
begin
  if p_amount_pence <= 0 then
    raise exception 'Amount must be positive' using errcode = '22023';
  end if;

  select * into v_booking from "PS_CLEAN_bookings" where id = p_booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if ps_clean_current_customer_id() is null or v_booking.customer_id is distinct from ps_clean_current_customer_id() then
    raise exception 'Not your booking' using errcode = '42501';
  end if;

  if v_booking.status <> 'pending_payment' then
    raise exception 'Credit can only be applied before payment' using errcode = '22023';
  end if;

  if p_amount_pence > v_booking.price_pence then
    raise exception 'Cannot redeem more than the booking total' using errcode = '22023';
  end if;

  select ps_clean_customer_credit_balance(v_booking.customer_id) into v_balance;
  if p_amount_pence > v_balance then
    raise exception 'Insufficient credit balance' using errcode = '22023';
  end if;

  insert into "PS_CLEAN_customer_credits" (customer_id, amount_pence, reason, related_booking_id)
  values (v_booking.customer_id, -p_amount_pence, 'redeemed', p_booking_id);

  update "PS_CLEAN_bookings"
  set price_pence = price_pence - p_amount_pence,
      -- A deposit can never exceed what's now actually owed.
      deposit_pence = least(deposit_pence, price_pence - p_amount_pence),
      updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

grant execute on function ps_clean_redeem_credit(uuid, integer) to authenticated;
