import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPence, formatTime } from "@/lib/format";
import type { Booking, Cleaner, Service } from "@/lib/types";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ bookingId?: string }>;
}) {
  const { bookingId } = await searchParams;
  const { customer } = await requireCustomer();

  const supabase = await createClient();
  const { data } = bookingId
    ? await supabase
        .from("PS_CLEAN_bookings")
        .select("*, PS_CLEAN_services(*), PS_CLEAN_cleaners(*)")
        .eq("id", bookingId)
        .eq("customer_id", customer.id)
        .maybeSingle()
    : { data: null };

  const booking = data as (Booking & { PS_CLEAN_services: Service; PS_CLEAN_cleaners: Cleaner }) | null;

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
        ✓
      </div>
      <h1 className="mt-4 text-xl font-semibold text-foreground">
        {booking?.status === "pending_payment" ? "Payment processing" : "Booking confirmed"}
      </h1>
      {booking ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {booking.PS_CLEAN_services.name} with {booking.PS_CLEAN_cleaners.full_name} on{" "}
          {formatDate(booking.starts_at)} at {formatTime(booking.starts_at)}.
          <br />
          Total: {formatPence(booking.price_pence)}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">We&apos;re confirming your booking now.</p>
      )}
      <Link href="/account" className="mt-6 inline-block text-sm font-medium text-brand hover:underline">
        View my bookings
      </Link>
    </div>
  );
}
