import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToCleaner } from "@/lib/push";
import { sendBookingConfirmation, sendBookingMovedEmails, sendOwnerAlert, sendQuoteRequestToOwner } from "@/lib/notify";
import { getBusinessOrigin } from "@/lib/business";
import { formatDate, formatTime } from "@/lib/format";

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

const dateLine = (iso: string) => `${formatDate(iso)} at ${formatTime(iso)}`;

// Who hears about the business's jobs: its owners, plus its contact email
// when that is a different inbox.
export async function ownerEmails(service: SupabaseClient, businessId: string): Promise<string[]> {
  const [{ data: owners }, { data: business }] = await Promise.all([
    service.from("PS_CLEAN_admin_users").select("email").eq("business_id", businessId).eq("role", "owner"),
    service.from("PS_CLEAN_businesses").select("contact_email").eq("id", businessId).maybeSingle(),
  ]);
  const emails = [...(owners ?? []).map((o) => o.email as string), business?.contact_email ?? ""]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(emails));
}

// Marks a new booking confirmed and sends the confirmation, with the booking
// reference the customer needs to change it later. Nothing is paid online, so
// every booking is confirmed as soon as it is made. No-ops if the booking
// isn't 'pending_payment' (already confirmed, or cancelled), so it's safe to
// call more than once.
export async function confirmBookingAndNotify(service: SupabaseClient, bookingId: string): Promise<void> {
  const { data: booking } = await service
    .from("PS_CLEAN_bookings")
    .select(
      "id, reference, business_id, status, price_pence, starts_at, notes, customer_id, cleaner_id, service_id, address_id, quote_status"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.status !== "pending_payment") return;

  await service.from("PS_CLEAN_bookings").update({ status: "confirmed", updated_at: new Date().toISOString() }).eq("id", bookingId);

  const [{ data: customer }, { data: cleaner }, { data: svc }, { data: address }, { data: business }] =
    await Promise.all([
      service.from("PS_CLEAN_customers").select("full_name, email, phone").eq("id", booking.customer_id).maybeSingle(),
      service.from("PS_CLEAN_cleaners").select("full_name").eq("id", booking.cleaner_id).maybeSingle(),
      service.from("PS_CLEAN_services").select("name").eq("id", booking.service_id).maybeSingle(),
      service.from("PS_CLEAN_customer_addresses").select("line1, city, postcode").eq("id", booking.address_id).maybeSingle(),
      service.from("PS_CLEAN_businesses").select("business_name, contact_email, slug, custom_domain").eq("id", booking.business_id).maybeSingle(),
    ]);

  await sendBookingConfirmation({
    bookingId: booking.id,
    businessName: business?.business_name ?? "Cleaning Company",
    serviceName: svc?.name ?? "Clean",
    cleanerName: cleaner?.full_name ?? "your cleaner",
    startsAt: booking.starts_at,
    addressLine: address ? `${address.line1}, ${address.city} ${address.postcode}` : "your address",
    pricePence: booking.price_pence,
    customerName: customer?.full_name ?? null,
    customerEmail: customer?.email ?? null,
    customerPhone: customer?.phone ?? null,
    quotePending: booking.quote_status === "pending",
    replyTo: business?.contact_email ?? null,
    reference: booking.reference,
    amendUrl: business ? `${getBusinessOrigin(business)}/amend` : undefined,
  });

  // Tell the cleaner on their phone, if they have notifications turned on.
  const isWalkthrough = /walk\s?-?through/i.test(svc?.name ?? "");
  await sendPushToCleaner(service, booking.cleaner_id, {
    title: isWalkthrough ? "New walkthrough booked" : "New booking",
    body: `${svc?.name ?? "Clean"}, ${dateLine(booking.starts_at)}${address ? `, ${address.line1}, ${address.postcode}` : ""}`,
    url: `/cleaner/bookings/${booking.id}`,
  });

  if (booking.quote_status === "pending" && business?.contact_email) {
    await sendQuoteRequestToOwner(
      business.business_name,
      business.contact_email,
      svc?.name ?? "Clean",
      dateLine(booking.starts_at),
      customer?.full_name ?? null,
      `${getBusinessOrigin(business)}/admin/bookings/${booking.id}`
    );
  }
}

type MovedRow = {
  reference: string;
  business_id: string;
  starts_at: string;
  cleaner_id: string;
  PS_CLEAN_customers: { email: string | null } | { email: string | null }[] | null;
  PS_CLEAN_cleaners: { email: string | null } | { email: string | null }[] | null;
  PS_CLEAN_services: { name: string } | { name: string }[] | null;
  PS_CLEAN_businesses:
    | { business_name: string; slug: string; custom_domain: string | null; contact_email: string | null }
    | { business_name: string; slug: string; custom_domain: string | null; contact_email: string | null }[]
    | null;
};

// After a customer moves their booking with their reference.
export async function notifyBookingMoved(service: SupabaseClient, bookingId: string, previousStart: string): Promise<void> {
  const { data } = await service
    .from("PS_CLEAN_bookings")
    .select(
      "reference, business_id, starts_at, cleaner_id, PS_CLEAN_customers(email), PS_CLEAN_cleaners(email), PS_CLEAN_services(name), PS_CLEAN_businesses(business_name, slug, custom_domain, contact_email)"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!data) return;
  const row = data as unknown as MovedRow;
  const business = one(row.PS_CLEAN_businesses);
  if (!business) return;

  await sendBookingMovedEmails({
    businessName: business.business_name,
    serviceName: one(row.PS_CLEAN_services)?.name ?? "clean",
    reference: row.reference,
    oldDateLine: dateLine(previousStart),
    newDateLine: dateLine(row.starts_at),
    customerEmail: one(row.PS_CLEAN_customers)?.email ?? null,
    cleanerEmail: one(row.PS_CLEAN_cleaners)?.email ?? null,
    ownerEmails: await ownerEmails(service, row.business_id),
    adminUrl: `${getBusinessOrigin(business)}/admin/bookings/${bookingId}`,
    replyTo: business.contact_email,
  });

  await sendPushToCleaner(service, row.cleaner_id, {
    title: "Job moved",
    body: `${one(row.PS_CLEAN_services)?.name ?? "Clean"} is now ${dateLine(row.starts_at)}`,
    url: `/cleaner/bookings/${bookingId}`,
  });
}

// A cleaner has marked a job complete: the owner is emailed every time.
export async function notifyOwnerJobComplete(service: SupabaseClient, bookingId: string): Promise<void> {
  const { data } = await service
    .from("PS_CLEAN_bookings")
    .select(
      "reference, business_id, starts_at, PS_CLEAN_cleaners(full_name), PS_CLEAN_customers(full_name), PS_CLEAN_services(name), PS_CLEAN_businesses(business_name, slug, custom_domain)"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!data) return;
  const cleaner = one(data.PS_CLEAN_cleaners as { full_name: string } | { full_name: string }[] | null);
  const customer = one(data.PS_CLEAN_customers as { full_name: string | null } | { full_name: string | null }[] | null);
  const svc = one(data.PS_CLEAN_services as { name: string } | { name: string }[] | null);
  type B = { business_name: string; slug: string; custom_domain: string | null };
  const business = one(data.PS_CLEAN_businesses as B | B[] | null);
  if (!business) return;

  await sendOwnerAlert(
    business.business_name,
    await ownerEmails(service, data.business_id),
    `Job complete: ${svc?.name ?? "Clean"} for ${customer?.full_name ?? "a customer"}`,
    [
      `${cleaner?.full_name ?? "The cleaner"} has marked the ${svc?.name ?? "clean"} for ${customer?.full_name ?? "a customer"} on ${dateLine(data.starts_at)} as complete (reference ${data.reference}).`,
      "Before and after photos are on the booking.",
    ],
    { url: `${getBusinessOrigin(business)}/admin/bookings/${bookingId}`, label: "View the booking" }
  );
}
