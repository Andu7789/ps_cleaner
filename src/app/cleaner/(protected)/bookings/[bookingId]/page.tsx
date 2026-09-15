import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCleaner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDuration, formatTime } from "@/lib/format";
import { CompleteButton } from "@/components/cleaner/complete-button";
import { PhotoUpload } from "@/components/cleaner/photo-upload";
import { PhotoThumb } from "@/components/cleaner/photo-thumb";
import type { Booking, BookingPhoto, Customer, CustomerAddress, Service } from "@/lib/types";

const PHOTO_BUCKET = "ps-clean-booking-photos";

type JobRow = Booking & {
  PS_CLEAN_services: Service;
  PS_CLEAN_customers: Customer;
  PS_CLEAN_customer_addresses: CustomerAddress;
};

export default async function CleanerBookingPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const { cleaner } = await requireCleaner();
  const supabase = await createClient();

  const { data } = await supabase
    .from("PS_CLEAN_bookings")
    .select("*, PS_CLEAN_services(*), PS_CLEAN_customers(*), PS_CLEAN_customer_addresses(*)")
    .eq("id", bookingId)
    .eq("cleaner_id", cleaner.id)
    .maybeSingle();

  if (!data) notFound();
  const job = data as JobRow;

  const { data: photoRows } = await supabase
    .from("PS_CLEAN_booking_photos")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  const photos = (photoRows ?? []) as BookingPhoto[];

  const signedPhotos = await Promise.all(
    photos.map(async (photo) => {
      const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(photo.storage_path, 3600);
      return { ...photo, url: signed?.signedUrl ?? null };
    })
  );
  const before = signedPhotos.filter((p) => p.kind === "before");
  const after = signedPhotos.filter((p) => p.kind === "after");

  return (
    <div>
      <Link href="/cleaner" className="text-sm text-muted-foreground hover:underline">
        &larr; Today&apos;s jobs
      </Link>

      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <h1 className="font-semibold text-foreground">{job.PS_CLEAN_services.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(job.starts_at)} at {formatTime(job.starts_at)} &middot;{" "}
          {formatDuration(job.PS_CLEAN_services.duration_minutes)}
        </p>
        <span className="mt-2 inline-block text-xs capitalize text-muted-foreground">
          {job.status.replace("_", " ")}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Customer</h2>
        <p className="mt-1 text-sm text-foreground">{job.PS_CLEAN_customers.full_name}</p>
        {job.PS_CLEAN_customers.phone && (
          <p className="text-sm text-muted-foreground">
            <a href={`tel:${job.PS_CLEAN_customers.phone}`} className="hover:underline">
              {job.PS_CLEAN_customers.phone}
            </a>
          </p>
        )}
        <h2 className="mt-4 font-semibold text-foreground">Address</h2>
        <p className="mt-1 text-sm text-foreground">
          {job.PS_CLEAN_customer_addresses.line1}
          {job.PS_CLEAN_customer_addresses.line2 ? `, ${job.PS_CLEAN_customer_addresses.line2}` : ""}
        </p>
        <p className="text-sm text-foreground">
          {job.PS_CLEAN_customer_addresses.city} {job.PS_CLEAN_customer_addresses.postcode}
        </p>
        {job.PS_CLEAN_customer_addresses.access_notes && (
          <p className="mt-2 text-sm text-muted-foreground">
            Access notes: {job.PS_CLEAN_customer_addresses.access_notes}
          </p>
        )}
        {job.notes && <p className="mt-2 text-sm text-muted-foreground">Booking notes: {job.notes}</p>}
      </div>

      {(job.status === "confirmed" || job.status === "completed") && (
        <div className="mt-4 space-y-5 rounded-xl border border-border bg-card p-5">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Before photos</h2>
              <PhotoUpload bookingId={job.id} kind="before" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {before.map((p) => p.url && <PhotoThumb key={p.id} photoId={p.id} url={p.url} />)}
              {before.length === 0 && <p className="text-xs text-muted-foreground">No before photos yet.</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">After photos</h2>
              <PhotoUpload bookingId={job.id} kind="after" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {after.map((p) => p.url && <PhotoThumb key={p.id} photoId={p.id} url={p.url} />)}
              {after.length === 0 && <p className="text-xs text-muted-foreground">No after photos yet.</p>}
            </div>
          </div>
        </div>
      )}

      {job.status === "confirmed" && (
        <div className="mt-4">
          <CompleteButton bookingId={job.id} />
        </div>
      )}
    </div>
  );
}
