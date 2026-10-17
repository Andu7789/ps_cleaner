import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

// A business either keeps its card payments on the platform Stripe account
// ("platform") or has them sent on to its own Stripe Express account
// ("connect"). Everything else stays on the platform account either way:
// customers, saved cards, PaymentIntents and the webhook. A destination
// charge only adds transfer_data, and no application fee is taken.

export type PaymentMode = "platform" | "connect";

export interface PaymentBusiness {
  payment_mode: PaymentMode;
  stripe_connect_account_id: string | null;
  stripe_charges_enabled: boolean;
}

export const NOT_READY_MESSAGE = "This business isn't set up to take card payments yet. Please contact them directly.";

// The extra PaymentIntent fields for this business. Throws for a connect
// business whose Stripe account isn't ready, because the charge would
// otherwise fail at Stripe with a far less helpful error.
export function routingFor(business: PaymentBusiness): Pick<Stripe.PaymentIntentCreateParams, "transfer_data"> {
  if (business.payment_mode !== "connect") return {};
  if (!business.stripe_connect_account_id || !business.stripe_charges_enabled) {
    throw new Error(NOT_READY_MESSAGE);
  }
  return { transfer_data: { destination: business.stripe_connect_account_id } };
}

export async function paymentRoutingForBusiness(
  db: SupabaseClient,
  businessId: string,
): Promise<Pick<Stripe.PaymentIntentCreateParams, "transfer_data">> {
  const { data } = await db
    .from("PS_CLEAN_businesses")
    .select("payment_mode, stripe_connect_account_id, stripe_charges_enabled")
    .eq("id", businessId)
    .single();
  if (!data) throw new Error("Business not found.");
  return routingFor(data as PaymentBusiness);
}

export async function paymentRoutingForBooking(db: SupabaseClient, bookingId: string) {
  const { data } = await db.from("PS_CLEAN_bookings").select("business_id").eq("id", bookingId).single();
  if (!data) throw new Error("Booking not found.");
  return paymentRoutingForBusiness(db, data.business_id as string);
}

export function accountIsReady(account: Pick<Stripe.Account, "charges_enabled" | "details_submitted">): boolean {
  return Boolean(account.charges_enabled && account.details_submitted);
}

// Creates the owner's Express account once and remembers it.
export async function ensureConnectAccount(
  db: SupabaseClient,
  business: { id: string; business_name: string; contact_email: string | null; stripe_connect_account_id: string | null },
): Promise<string> {
  if (business.stripe_connect_account_id) return business.stripe_connect_account_id;
  const account = await getStripe().accounts.create({
    type: "express",
    country: "GB",
    email: business.contact_email ?? undefined,
    business_profile: { name: business.business_name },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    metadata: { ps_clean_business_id: business.id },
  });
  const { error } = await db
    .from("PS_CLEAN_businesses")
    .update({ stripe_connect_account_id: account.id })
    .eq("id", business.id);
  if (error) throw new Error(error.message);
  return account.id;
}

// Stripe's onboarding links expire within minutes, so they are made fresh
// each time the owner clicks through rather than stored or emailed.
export async function createOnboardingLink(accountId: string, origin: string): Promise<string> {
  const link = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/admin/payments/connect`,
    return_url: `${origin}/admin/settings?payments=returned`,
    type: "account_onboarding",
  });
  return link.url;
}

// Reads the account from Stripe and stores whether it can take payments.
export async function syncConnectStatus(db: SupabaseClient, businessId: string, accountId: string): Promise<boolean> {
  const account = await getStripe().accounts.retrieve(accountId);
  const ready = accountIsReady(account);
  await db.from("PS_CLEAN_businesses").update({ stripe_charges_enabled: ready }).eq("id", businessId);
  return ready;
}
