import { sendBookingReminder } from "@/lib/notify";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Called on a schedule (pg_cron+pg_net once deployed, or any external
// scheduler — see ROADMAP.md) to send the day-before reminder. Idempotent:
// only sends for bookings that don't already have a 'reminder' row in
// PS_CLEAN_notifications_log, so calling this more often than needed (or
// retrying after a partial failure) never double-sends.
async function handler(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const service = createServiceClient();

  // Runs across every business — reminder_hours_before and business_name
  // are per-business now, so this loops per business rather than one
  // cross-tenant query with a single global window/name.
  const { data: businesses, error: businessesError } = await service
    .from("PS_CLEAN_businesses")
    .select("id, business_name, reminder_hours_before");
  if (businessesError) return new Response(businessesError.message, { status: 500 });

  let checked = 0;
  let sent = 0;

  for (const business of businesses ?? []) {
    const windowStart = new Date();
    const windowEnd = new Date(windowStart.getTime() + business.reminder_hours_before * 60 * 60 * 1000);

    const { data: bookings, error } = await service
      .from("PS_CLEAN_bookings")
      .select(
        "id, starts_at, notes, customer_id, cleaner_id, service_id, address_id, price_pence, deposit_pence, PS_CLEAN_customers(full_name, email, phone), PS_CLEAN_cleaners(full_name), PS_CLEAN_services(name), PS_CLEAN_customer_addresses(line1, city, postcode)"
      )
      .eq("business_id", business.id)
      .eq("status", "confirmed")
      .gte("starts_at", windowStart.toISOString())
      .lt("starts_at", windowEnd.toISOString());
    if (error) return new Response(error.message, { status: 500 });

    checked += bookings?.length ?? 0;

    for (const booking of bookings ?? []) {
      const { data: alreadySent } = await service
        .from("PS_CLEAN_notifications_log")
        .select("id")
        .eq("booking_id", booking.id)
        .eq("type", "reminder")
        .eq("status", "sent")
        .maybeSingle();
      if (alreadySent) continue;

      const customer = Array.isArray(booking.PS_CLEAN_customers) ? booking.PS_CLEAN_customers[0] : booking.PS_CLEAN_customers;
      const cleaner = Array.isArray(booking.PS_CLEAN_cleaners) ? booking.PS_CLEAN_cleaners[0] : booking.PS_CLEAN_cleaners;
      const svc = Array.isArray(booking.PS_CLEAN_services) ? booking.PS_CLEAN_services[0] : booking.PS_CLEAN_services;
      const address = Array.isArray(booking.PS_CLEAN_customer_addresses)
        ? booking.PS_CLEAN_customer_addresses[0]
        : booking.PS_CLEAN_customer_addresses;

      await sendBookingReminder({
        bookingId: booking.id,
        businessName: business.business_name,
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
      sent++;
    }
  }

  return Response.json({ checked, sent });
}

// GET for Vercel Cron (only ever triggers via GET, auto-attaching this
// Authorization header for an env var literally named CRON_SECRET); POST
// for everything else (Cloudflare's scheduled() handler, manual triggering).
export const GET = handler;
export const POST = handler;
