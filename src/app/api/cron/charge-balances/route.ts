import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Deposit-now, off-session-balance-later (see DECISIONS.md #6): a few days
// before the job, charge whatever's still owed against the payment method
// saved at booking time. The actual success/failure of the charge is
// reconciled by the Stripe webhook (payment_intent.succeeded/failed), not
// here — this route's job is only to kick the charge off. A failed
// off-session charge (declined card, or requires_action for 3DS) is
// surfaced as a 'failed' PS_CLEAN_payments row for the admin to see and
// chase; automatic customer-facing retry/escalation is a good next step
// (see ROADMAP.md) rather than something this pass builds out.
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const service = createServiceClient();
  const { data: settings } = await service
    .from("PS_CLEAN_business_settings")
    .select("balance_charge_days_before")
    .eq("id", true)
    .maybeSingle();

  const daysBefore = settings?.balance_charge_days_before ?? 2;
  const windowEnd = new Date(Date.now() + daysBefore * 24 * 60 * 60 * 1000);

  const { data: bookings, error } = await service
    .from("PS_CLEAN_bookings")
    .select("id, starts_at, price_pence, amount_paid_pence, customer_id, PS_CLEAN_customers(stripe_customer_id, stripe_default_payment_method_id)")
    .eq("status", "confirmed")
    .lt("starts_at", windowEnd.toISOString())
    .gt("starts_at", new Date().toISOString());

  if (error) return new Response(error.message, { status: 500 });

  const stripe = getStripe();
  let charged = 0;

  for (const booking of bookings ?? []) {
    const remaining = booking.price_pence - booking.amount_paid_pence;
    if (remaining <= 0) continue;

    const customer = Array.isArray(booking.PS_CLEAN_customers) ? booking.PS_CLEAN_customers[0] : booking.PS_CLEAN_customers;
    if (!customer?.stripe_customer_id || !customer?.stripe_default_payment_method_id) continue;

    const { data: alreadyAttempted } = await service
      .from("PS_CLEAN_payments")
      .select("id")
      .eq("booking_id", booking.id)
      .eq("type", "balance")
      .maybeSingle();
    if (alreadyAttempted) continue;

    try {
      const intent = await stripe.paymentIntents.create({
        amount: remaining,
        currency: "gbp",
        customer: customer.stripe_customer_id,
        payment_method: customer.stripe_default_payment_method_id,
        off_session: true,
        confirm: true,
        metadata: { ps_clean_booking_id: booking.id, ps_clean_payment_type: "balance" },
      });

      await service.from("PS_CLEAN_payments").insert({
        booking_id: booking.id,
        stripe_payment_intent_id: intent.id,
        type: "balance",
        amount_pence: remaining,
        status: intent.status === "succeeded" ? "succeeded" : "pending",
      });
      charged++;
    } catch (err) {
      await service.from("PS_CLEAN_payments").insert({
        booking_id: booking.id,
        type: "balance",
        amount_pence: remaining,
        status: "failed",
        failure_message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ checked: bookings?.length ?? 0, charged });
}
