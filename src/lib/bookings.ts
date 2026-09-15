import type { SupabaseClient } from "@supabase/supabase-js";
import { toLondonDateKey } from "@/lib/calendar";
import { formatDate } from "@/lib/format";
import { sendWaitlistOpeningEmail } from "@/lib/notify";

// System-initiated cancellation (Stripe webhook, scheduled cleanup jobs) —
// NOT the customer-facing path. Deliberately a direct table update via the
// service-role client rather than the ps_clean_cancel_booking RPC: that RPC
// checks the caller owns the booking (via auth.uid()), which a service-role
// call has no way to satisfy — it isn't acting on behalf of any signed-in
// user. service_role bypasses RLS at the Postgres role level (BYPASSRLS),
// which is what every other system-initiated write in this app already
// relies on (see the rest of the Stripe webhook handler), so this is
// consistent with that rather than a special case.
export async function cancelBookingAsSystem(
  service: SupabaseClient,
  bookingId: string,
  reason: string
): Promise<void> {
  const { data: updated } = await service
    .from("PS_CLEAN_bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .neq("status", "cancelled")
    .select("id")
    .maybeSingle();

  if (updated) await notifyWaitlistOnCancellation(service, bookingId);
}

// Called after ANY booking is actually cancelled (customer, admin, or
// system — see cancelBookingAction, adminSetBookingStatusAction, and
// cancelBookingAsSystem above), since a slot freeing up matters to a
// waiting customer no matter why it freed up. Needs the service-role
// client regardless of who's cancelling — reading another customer's
// email (to notify them) and another cleaner's schedule isn't something
// the cancelling user's own RLS-scoped session can do.
export async function notifyWaitlistOnCancellation(service: SupabaseClient, bookingId: string): Promise<void> {
  const { data: booking } = await service
    .from("PS_CLEAN_bookings")
    .select("service_id, cleaner_id, starts_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return;

  const wantedDate = toLondonDateKey(booking.starts_at);

  const { data: entries } = await service
    .from("PS_CLEAN_waitlist_entries")
    .select("id, customer_id")
    .eq("service_id", booking.service_id)
    .eq("wanted_date", wantedDate)
    .is("notified_at", null)
    .or(`cleaner_id.is.null,cleaner_id.eq.${booking.cleaner_id}`);
  if (!entries || entries.length === 0) return;

  const [{ data: svc }, { data: settings }] = await Promise.all([
    service.from("PS_CLEAN_services").select("name").eq("id", booking.service_id).maybeSingle(),
    service.from("PS_CLEAN_business_settings").select("business_name").eq("id", true).maybeSingle(),
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const bookingUrl = `${siteUrl}/book/${booking.service_id}`;

  for (const entry of entries) {
    const { data: customer } = await service
      .from("PS_CLEAN_customers")
      .select("email")
      .eq("id", entry.customer_id)
      .maybeSingle();

    if (customer?.email) {
      await sendWaitlistOpeningEmail(
        settings?.business_name ?? "Cleaning Company",
        customer.email,
        svc?.name ?? "your service",
        formatDate(booking.starts_at),
        bookingUrl
      );
    }

    await service.from("PS_CLEAN_waitlist_entries").update({ notified_at: new Date().toISOString() }).eq("id", entry.id);
  }
}
