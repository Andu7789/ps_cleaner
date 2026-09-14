"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { FreeSlotRange } from "@/lib/types";

export async function getAvailableSlotsAction(
  serviceId: string,
  date: string
): Promise<FreeSlotRange[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ps_clean_available_slots", {
    p_service_id: serviceId,
    p_date: date,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as FreeSlotRange[];
}

export interface CreateBookingInput {
  cleanerId: string;
  serviceId: string;
  addressId: string;
  startsAt: string;
  notes?: string;
}

export interface CreateBookingResult {
  bookingId: string;
  clientSecret: string | null;
  amountDuePence: number;
}

// Creates the booking row (via the ps_clean_create_booking RPC, which is the
// actual source of truth for "no double-booking" — see DECISIONS.md #4),
// then creates a Stripe PaymentIntent for whatever's due now (deposit or
// full price). The card isn't charged until the browser confirms it against
// the returned client secret; PS_CLEAN_bookings starts at 'pending_payment'
// and only moves to 'confirmed' once the Stripe webhook sees the charge
// succeed (see /src/app/api/webhooks/stripe/route.ts).
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
    })
    .single();

  if (error) throw new Error(error.message);
  const bookingRow = booking as { id: string; price_pence: number; deposit_pence: number };
  const amountDuePence = bookingRow.deposit_pence > 0 ? bookingRow.deposit_pence : bookingRow.price_pence;
  const paymentType = bookingRow.deposit_pence > 0 ? "deposit" : "full";

  const stripe = getStripe();
  const service = createServiceClient();

  let stripeCustomerId = customer.stripe_customer_id;
  if (!stripeCustomerId) {
    const stripeCustomer = await stripe.customers.create({
      email: customer.email ?? undefined,
      name: customer.full_name ?? undefined,
      metadata: { ps_clean_customer_id: customer.id },
    });
    stripeCustomerId = stripeCustomer.id;
    await supabase.from("PS_CLEAN_customers").update({ stripe_customer_id: stripeCustomerId }).eq("id", customer.id);
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountDuePence,
    currency: "gbp",
    customer: stripeCustomerId,
    setup_future_usage: "off_session",
    metadata: { ps_clean_booking_id: bookingRow.id, ps_clean_payment_type: paymentType },
  });

  await service.from("PS_CLEAN_payments").insert({
    booking_id: bookingRow.id,
    stripe_payment_intent_id: paymentIntent.id,
    type: paymentType,
    amount_pence: amountDuePence,
    status: "pending",
  });

  return { bookingId: bookingRow.id, clientSecret: paymentIntent.client_secret, amountDuePence };
}

export async function cancelBookingAction(bookingId: string, reason?: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ps_clean_cancel_booking", {
    p_booking_id: bookingId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/account/bookings");
}
