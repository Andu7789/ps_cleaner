import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPence, formatTime } from "@/lib/format";
import { CancelBookingButton } from "@/components/booking/cancel-booking-button";
import { ResumePayment } from "@/components/booking/resume-payment";
import type { Booking, Cleaner, CustomerAddress, Service } from "@/lib/types";

type BookingRow = Booking & {
  PS_CLEAN_services: Service;
  PS_CLEAN_cleaners: Cleaner;
  PS_CLEAN_customer_addresses: CustomerAddress;
};

export default async function BookingDetailPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data } = await supabase
    .from("PS_CLEAN_bookings")
    .select("*, PS_CLEAN_services(*), PS_CLEAN_cleaners(*), PS_CLEAN_customer_addresses(*)")
    .eq("id", bookingId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (!data) notFound();
  const booking = data as BookingRow;

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Link href="/account" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to your bookings
      </Link>

      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <h1 className="font-semibold text-foreground">{booking.PS_CLEAN_services.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(booking.starts_at)} at {formatTime(booking.starts_at)} · {booking.PS_CLEAN_cleaners.full_name}
        </p>
        <p className="text-sm text-muted-foreground">
          {booking.PS_CLEAN_customer_addresses.line1}, {booking.PS_CLEAN_customer_addresses.city}{" "}
          {booking.PS_CLEAN_customer_addresses.postcode}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">{formatPence(booking.price_pence)}</span>
          <span className="text-xs capitalize text-muted-foreground">{booking.status.replace("_", " ")}</span>
        </div>
      </div>

      {booking.status === "pending_payment" && (
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground">Complete payment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This booking is holding its slot but hasn&apos;t been paid for yet.
          </p>
          <div className="mt-4">
            <ResumePayment bookingId={booking.id} />
          </div>
        </div>
      )}

      {booking.status === "confirmed" && (
        <div className="mt-6">
          <CancelBookingButton bookingId={booking.id} />
        </div>
      )}
    </div>
  );
}
