import type Stripe from "stripe";
import { cancelBookingAsSystem } from "@/lib/bookings";
import { applySucceededPaymentIntent } from "@/lib/payments";
import { getStripe } from "@/lib/stripe";
import { accountIsReady } from "@/lib/stripe-connect";
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
  // Two endpoints can point here: the normal one, and a Connect one that
  // listens for events on owners' connected accounts. Each has its own secret.
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (s): s is string => Boolean(s),
  );
  if (!signature || secrets.length === 0) {
    return new Response("Webhook not configured", { status: 500 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event | null = null;
  let lastError: unknown;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!event) return new Response(`Invalid signature: ${lastError}`, { status: 400 });

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

    // An owner finished (or changed) their Stripe onboarding.
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await service
        .from("PS_CLEAN_businesses")
        .update({ stripe_charges_enabled: accountIsReady(account) })
        .eq("stripe_connect_account_id", account.id);
      break;
    }

    default:
      break;
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
