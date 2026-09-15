import type Stripe from "stripe";
import { cancelBookingAsSystem } from "@/lib/bookings";
import { sendBookingConfirmation } from "@/lib/notify";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Single handler for every Stripe event this app cares about. Verifies
// against the RAW request body (not the parsed JSON) — Stripe's signature
// covers the exact bytes it sent, so re-serializing a parsed body would
// break verification. Idempotent by design: re-processing the same
// payment_intent.succeeded twice just re-sets the same status/amount.
export async function POST(request: Request) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return new Response("Webhook not configured", { status: 500 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return new Response(`Invalid signature: ${err}`, { status: 400 });
  }

  const service = createServiceClient();

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = intent.metadata.ps_clean_booking_id;
      if (!bookingId) break;

      const { data: payment } = await service
        .from("PS_CLEAN_payments")
        .update({ status: "succeeded", updated_at: new Date().toISOString() })
        .eq("stripe_payment_intent_id", intent.id)
        .select("amount_pence")
        .maybeSingle();

      const { data: booking } = await service
        .from("PS_CLEAN_bookings")
        .select(
          "id, status, amount_paid_pence, price_pence, deposit_pence, starts_at, notes, customer_id, cleaner_id, service_id, address_id"
        )
        .eq("id", bookingId)
        .maybeSingle();
      if (!booking) break;

      const newAmountPaid = booking.amount_paid_pence + (payment?.amount_pence ?? 0);
      await service
        .from("PS_CLEAN_bookings")
        .update({
          amount_paid_pence: newAmountPaid,
          status: booking.status === "pending_payment" ? "confirmed" : booking.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bookingId);

      // Save the card for the off-session balance/cancellation-fee charge
      // later (see DECISIONS.md #6) — only meaningful the first time.
      if (typeof intent.payment_method === "string" && intent.customer) {
        const customerId = typeof intent.customer === "string" ? intent.customer : intent.customer.id;
        await service
          .from("PS_CLEAN_customers")
          .update({ stripe_default_payment_method_id: intent.payment_method })
          .eq("stripe_customer_id", customerId);
      }

      if (booking.status === "pending_payment") {
        const [{ data: customer }, { data: cleaner }, { data: svc }, { data: address }, { data: settings }] =
          await Promise.all([
            service.from("PS_CLEAN_customers").select("full_name, email, phone").eq("id", booking.customer_id).maybeSingle(),
            service.from("PS_CLEAN_cleaners").select("full_name").eq("id", booking.cleaner_id).maybeSingle(),
            service.from("PS_CLEAN_services").select("name").eq("id", booking.service_id).maybeSingle(),
            service.from("PS_CLEAN_customer_addresses").select("line1, city, postcode").eq("id", booking.address_id).maybeSingle(),
            service.from("PS_CLEAN_business_settings").select("business_name").eq("id", true).maybeSingle(),
          ]);

        await sendBookingConfirmation({
          bookingId: booking.id,
          businessName: settings?.business_name ?? "Cleaning Company",
          serviceName: svc?.name ?? "Clean",
          cleanerName: cleaner?.full_name ?? "your cleaner",
          startsAt: booking.starts_at,
          addressLine: address ? `${address.line1}, ${address.city} ${address.postcode}` : "your address",
          pricePence: booking.price_pence,
          depositPence: booking.deposit_pence,
          customerName: customer?.full_name ?? null,
          customerEmail: customer?.email ?? null,
          customerPhone: customer?.phone ?? null,
        });
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = intent.metadata.ps_clean_booking_id;
      await service
        .from("PS_CLEAN_payments")
        .update({
          status: "failed",
          failure_message: intent.last_payment_error?.message ?? "Payment failed",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_payment_intent_id", intent.id);

      // Free the slot immediately rather than leaving it stuck in
      // 'pending_payment' forever. This webhook only fires if Stripe
      // reaches us at all — a customer who just closes the tab mid-checkout
      // leaves no event to react to, which is what the scheduled cleanup in
      // /api/cron/cancel-stale-bookings is for.
      if (bookingId) {
        await cancelBookingAsSystem(service, bookingId, "Payment failed");
      }
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (intentId) {
        await service
          .from("PS_CLEAN_payments")
          .update({ status: "refunded", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", intentId);
      }
      break;
    }

    default:
      break;
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
