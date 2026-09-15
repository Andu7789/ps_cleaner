"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { confirmBookingAndNotify } from "@/lib/payments";
import { getStripe } from "@/lib/stripe";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Customer, PaymentType } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export async function getAvailableSlotsAction(serviceId: string, date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ps_clean_available_slots", {
    p_service_id: serviceId,
    p_date: date,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as { cleaner_id: string; free_start: string; free_end: string }[];
}

async function ensureStripeCustomerId(
  stripe: Stripe,
  supabase: SupabaseClient,
  customer: Customer
): Promise<string> {
  if (customer.stripe_customer_id) return customer.stripe_customer_id;

  const stripeCustomer = await stripe.customers.create({
    email: customer.email ?? undefined,
    name: customer.full_name ?? undefined,
    metadata: { ps_clean_customer_id: customer.id },
  });
  await supabase.from("PS_CLEAN_customers").update({ stripe_customer_id: stripeCustomer.id }).eq("id", customer.id);
  return stripeCustomer.id;
}

// Creates a fresh PaymentIntent for whatever's due on a booking and records
// it as a 'pending' PS_CLEAN_payments row. The card isn't charged until the
// browser confirms it against the returned client secret; the booking only
// moves to 'confirmed' once the Stripe webhook sees the charge succeed (see
// /src/app/api/webhooks/stripe/route.ts).
async function createPaymentIntentForBooking(
  stripe: Stripe,
  service: SupabaseClient,
  bookingId: string,
  stripeCustomerId: string,
  amountDuePence: number,
  paymentType: PaymentType
): Promise<string> {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountDuePence,
    currency: "gbp",
    customer: stripeCustomerId,
    setup_future_usage: "off_session",
    metadata: { ps_clean_booking_id: bookingId, ps_clean_payment_type: paymentType },
  });

  await service.from("PS_CLEAN_payments").insert({
    booking_id: bookingId,
    stripe_payment_intent_id: paymentIntent.id,
    type: paymentType,
    amount_pence: amountDuePence,
    status: "pending",
  });

  if (!paymentIntent.client_secret) throw new Error("Couldn't start payment — please try again.");
  return paymentIntent.client_secret;
}

export interface CreateBookingInput {
  cleanerId: string;
  serviceId: string;
  addressId: string;
  startsAt: string;
  notes?: string;
  addonIds?: string[];
  applyCreditPence?: number;
}

export interface CreateBookingResult {
  bookingId: string;
  // null when credit fully covered the amount due — nothing left to pay,
  // no PaymentIntent was created (Stripe doesn't support a £0 one), and
  // the booking is already 'confirmed'.
  clientSecret: string | null;
  amountDuePence: number;
}

// Creates the booking row via the ps_clean_create_booking RPC — the actual
// source of truth for "no double-booking" (see DECISIONS.md #4) — applies
// any credit the customer chose to redeem, then starts payment for
// whatever's left.
export async function createBookingAction(input: CreateBookingInput): Promise<CreateBookingResult> {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data: booking, error } = await supabase
    .rpc("ps_clean_create_booking", {
      p_customer_id: customer.id,
      p_cleaner_id: input.cleanerId,
      p_service_id: input.serviceId,
      p_address_id: input.addressId,
      p_starts_at: input.startsAt,
      p_notes: input.notes ?? null,
      p_addon_ids: input.addonIds ?? [],
    })
    .single();

  if (error) throw new Error(error.message);
  let bookingRow = booking as { id: string; price_pence: number; deposit_pence: number };

  if (input.applyCreditPence && input.applyCreditPence > 0) {
    const { data: redeemed, error: redeemError } = await supabase
      .rpc("ps_clean_redeem_credit", { p_booking_id: bookingRow.id, p_amount_pence: input.applyCreditPence })
      .single();
    if (redeemError) throw new Error(redeemError.message);
    bookingRow = redeemed as typeof bookingRow;
  }

  const amountDuePence = bookingRow.deposit_pence > 0 ? bookingRow.deposit_pence : bookingRow.price_pence;

  if (amountDuePence <= 0) {
    const service = createServiceClient();
    await confirmBookingAndNotify(service, bookingRow.id);
    return { bookingId: bookingRow.id, clientSecret: null, amountDuePence: 0 };
  }

  const paymentType: PaymentType = bookingRow.deposit_pence > 0 ? "deposit" : "full";

  const stripe = getStripe();
  const service = createServiceClient();
  const stripeCustomerId = await ensureStripeCustomerId(stripe, supabase, customer);
  const clientSecret = await createPaymentIntentForBooking(
    stripe,
    service,
    bookingRow.id,
    stripeCustomerId,
    amountDuePence,
    paymentType
  );

  return { bookingId: bookingRow.id, clientSecret, amountDuePence };
}

export interface ResumePaymentResult {
  clientSecret: string;
  amountDuePence: number;
}

// Gets a payable client secret for a booking stuck at 'pending_payment' —
// either because the customer never finished the card step, or because
// creating the PaymentIntent itself failed after the booking row was
// already inserted (e.g. Stripe not configured yet), which otherwise
// leaves a booking holding its slot with no way to ever pay for it.
// Reuses the existing PaymentIntent if it's still payable; otherwise
// creates a fresh one, same as createBookingAction does at booking time.
export async function resumeBookingPaymentAction(bookingId: string): Promise<ResumePaymentResult> {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data: booking, error: bookingError } = await supabase
    .from("PS_CLEAN_bookings")
    .select("id, status, price_pence, deposit_pence, customer_id")
    .eq("id", bookingId)
    .single();
  if (bookingError) throw new Error(bookingError.message);
  if (booking.customer_id !== customer.id) throw new Error("Not your booking");
  if (booking.status !== "pending_payment") throw new Error("This booking doesn't need payment.");

  const amountDuePence = booking.deposit_pence > 0 ? booking.deposit_pence : booking.price_pence;
  const paymentType: PaymentType = booking.deposit_pence > 0 ? "deposit" : "full";

  const stripe = getStripe();
  const service = createServiceClient();

  const { data: existingPayment } = await service
    .from("PS_CLEAN_payments")
    .select("stripe_payment_intent_id")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPayment?.stripe_payment_intent_id) {
    const intent = await stripe.paymentIntents.retrieve(existingPayment.stripe_payment_intent_id);
    if (
      intent.client_secret &&
      ["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)
    ) {
      return { clientSecret: intent.client_secret, amountDuePence };
    }
  }

  const stripeCustomerId = await ensureStripeCustomerId(stripe, supabase, customer);
  const clientSecret = await createPaymentIntentForBooking(
    stripe,
    service,
    bookingId,
    stripeCustomerId,
    amountDuePence,
    paymentType
  );

  return { clientSecret, amountDuePence };
}

export async function cancelBookingAction(bookingId: string, reason?: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ps_clean_cancel_booking", {
    p_booking_id: bookingId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/account");
}
