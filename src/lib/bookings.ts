import type { SupabaseClient } from "@supabase/supabase-js";

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
  await service
    .from("PS_CLEAN_bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .neq("status", "cancelled");
}
