import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPence, formatTime } from "@/lib/format";
import { CancelBookingButton } from "@/components/booking/cancel-booking-button";
import { MakeRecurringForm } from "@/components/booking/make-recurring-form";
import { ResumePayment } from "@/components/booking/resume-payment";
import { ReviewForm } from "@/components/booking/review-form";
import type { Booking, BookingPhoto, Cleaner, CustomerAddress, Review, Service } from "@/lib/types";

const PHOTO_BUCKET = "ps-clean-booking-photos";

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

  let existingReview: Review | null = null;
  let photosByKind: { before: { id: string; url: string }[]; after: { id: string; url: string }[] } = {
    before: [],
    after: [],
  };
  if (booking.status === "completed") {
    const { data: reviewData } = await supabase
      .from("PS_CLEAN_reviews")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle();
    existingReview = reviewData as Review | null;

    const { data: photoRows } = await supabase
      .from("PS_CLEAN_booking_photos")
      .select("*")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });
    const signed = await Promise.all(
      ((photoRows ?? []) as BookingPhoto[]).map(async (photo) => {
        const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(photo.storage_path, 3600);
        return { id: photo.id, kind: photo.kind, url: data?.signedUrl ?? null };
      })
    );
    photosByKind = {
      before: signed.filter((p) => p.kind === "before" && p.url).map((p) => ({ id: p.id, url: p.url as string })),
      after: signed.filter((p) => p.kind === "after" && p.url).map((p) => ({ id: p.id, url: p.url as string })),
    };
  }

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
        <div className="mt-6 space-y-4">
          {!booking.recurring_booking_id && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold text-foreground">Make it regular</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;ll automatically book the same cleaner, service, and address at this time.
              </p>
              <div className="mt-3">
                <MakeRecurringForm bookingId={booking.id} />
              </div>
            </div>
          )}
          <CancelBookingButton bookingId={booking.id} />
        </div>
      )}

      {booking.status === "completed" && (photosByKind.before.length > 0 || photosByKind.after.length > 0) && (
        <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5">
          {photosByKind.before.length > 0 && (
            <div>
              <h2 className="font-semibold text-foreground">Before</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {photosByKind.before.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL
                  <img key={p.id} src={p.url} alt="Before the clean" className="h-24 w-24 rounded-lg object-cover" />
                ))}
              </div>
            </div>
          )}
          {photosByKind.after.length > 0 && (
            <div>
              <h2 className="font-semibold text-foreground">After</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {photosByKind.after.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL
                  <img key={p.id} src={p.url} alt="After the clean" className="h-24 w-24 rounded-lg object-cover" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {booking.status === "completed" && (
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground">Your review</h2>
          {existingReview ? (
            <div className="mt-2">
              <div className="flex gap-0.5" aria-label={`${existingReview.rating} out of 5 stars`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className={n <= existingReview.rating ? "text-amber-400" : "text-border"}>
                    ★
                  </span>
                ))}
              </div>
              {existingReview.comment && (
                <p className="mt-2 text-sm text-muted-foreground">{existingReview.comment}</p>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <ReviewForm bookingId={booking.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
