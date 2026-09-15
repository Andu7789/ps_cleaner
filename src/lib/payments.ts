import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { sendBookingConfirmation } from "@/lib/notify";

// The single place that reconciles a succeeded Stripe PaymentIntent against
// our own booking state: marks the payment row succeeded, bumps the
// booking's amount_paid_pence, confirms it if this was the first payment to
// land, saves the card for future off-session charges, and sends the
// confirmation. Shared by the webhook (the normal path) and the manual
// "sync payment" admin action (the recovery path for when the webhook
// never reached us — see DECISIONS.md #10/#11, this bit us once already in
// local dev with no stripe listen running). Idempotent: re-applying an
// already-reconciled PaymentIntent just re-sets the same values.
export async function applySucceededPaymentIntent(service: SupabaseClient, intent: Stripe.PaymentIntent): Promise<void> {
  const bookingId = intent.metadata.ps_clean_booking_id;
  if (!bookingId) return;

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
  if (!booking) return;

  const wasPendingPayment = booking.status === "pending_payment";
  const newAmountPaid = booking.amount_paid_pence + (payment?.amount_pence ?? 0);
  await service
    .from("PS_CLEAN_bookings")
    .update({
      amount_paid_pence: newAmountPaid,
      status: wasPendingPayment ? "confirmed" : booking.status,
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

  if (wasPendingPayment) {
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
}
