import type Stripe from "stripe";
import { cancelBookingAsSystem } from "@/lib/bookings";
import { applySucceededPaymentIntent } from "@/lib/payments";
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
      await applySucceededPaymentIntent(service, event.data.object as Stripe.PaymentIntent);
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
