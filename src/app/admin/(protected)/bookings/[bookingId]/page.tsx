import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { isOwner } from "@/lib/auth";
import { customerMinutes, formatDate, formatDuration, formatPence, formatTime } from "@/lib/format";
import { JobMap } from "@/components/cleaner/job-map";
import { QuoteForm } from "@/components/admin/quote-form";
import type { Booking, BookingCalculatorSelection, Cleaner, Customer, CustomerAddress, Service } from "@/lib/types";

type Row = Booking & {
  PS_CLEAN_services: Service;
  PS_CLEAN_cleaners: Cleaner;
  PS_CLEAN_customers: Customer;
  PS_CLEAN_customer_addresses: CustomerAddress;
};

// The same job details the cleaner sees (customer, address, map, home size),
// so the owner can price a walkthrough or quote without asking the cleaner.
export default async function AdminBookingDetailPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const business = await getCurrentBusiness();
  const supabase = await createClient();

  const { data } = await supabase
    .from("PS_CLEAN_bookings")
    .select("*, PS_CLEAN_services(*), PS_CLEAN_cleaners(*), PS_CLEAN_customers(*), PS_CLEAN_customer_addresses(*)")
    .eq("id", bookingId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!data) notFound();
  const job = data as Row;
  const address = job.PS_CLEAN_customer_addresses;
  const fullAddress = address ? [address.line1, address.line2, address.city, address.postcode].filter(Boolean).join(", ") : "";

  const { data: roomRows } = await supabase
    .from("PS_CLEAN_booking_calculator_selections")
    .select("*")
    .eq("booking_id", bookingId);
  const roomSelections = (roomRows ?? []) as BookingCalculatorSelection[];
  const owner = await isOwner();
  const canQuote = owner && job.quote_status && (job.status === "confirmed" || job.status === "pending_payment");

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/admin/bookings" className="text-sm text-muted-foreground hover:underline">
        &larr; Bookings
      </Link>

      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <h1 className="font-semibold text-foreground">{job.PS_CLEAN_services.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(job.starts_at)} at {formatTime(job.starts_at)} &middot;{" "}
          {formatDuration(customerMinutes(job.PS_CLEAN_services))} with the customer
        </p>
        <p className="text-sm text-muted-foreground">
          Diary blocked {formatTime(job.starts_at)} to {formatTime(job.ends_at)} (
          {formatDuration(Math.round((new Date(job.ends_at).getTime() - new Date(job.starts_at).getTime()) / 60_000))})
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Cleaner: {job.PS_CLEAN_cleaners?.full_name ?? "Unassigned"}</p>
        <span className="mt-2 inline-block text-xs capitalize text-muted-foreground">{job.status.replace("_", " ")}</span>
      </div>

      {job.quote_status && job.status !== "cancelled" && (
        <div className="mt-4 rounded-xl border border-border bg-muted p-5">
          <h2 className="font-semibold text-foreground">
            {job.quote_status === "pending" ? "Price not confirmed yet" : `Quoted ${formatPence(job.price_pence)}`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {job.quote_status === "pending"
              ? `Estimate ${formatPence(job.price_pence)}. ${owner ? "Set the exact price below." : "Waiting for an owner to confirm the price."}`
              : "The price has been confirmed."}
          </p>
          {canQuote && (
            <QuoteForm bookingId={job.id} estimatePence={job.price_pence} quoted={job.quote_status === "quoted"} />
          )}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Customer</h2>
        <p className="mt-1 text-sm text-foreground">{job.PS_CLEAN_customers?.full_name ?? "Unknown"}</p>
        {job.PS_CLEAN_customers?.email && <p className="text-sm text-muted-foreground">{job.PS_CLEAN_customers.email}</p>}
        {job.PS_CLEAN_customers?.phone && (
          <p className="text-sm text-muted-foreground">
            <a href={`tel:${job.PS_CLEAN_customers.phone}`} className="hover:underline">
              {job.PS_CLEAN_customers.phone}
            </a>
          </p>
        )}

        {address && (
          <>
            <h2 className="mt-4 font-semibold text-foreground">Address</h2>
            <p className="mt-1 text-sm text-foreground">
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ""}
            </p>
            <p className="text-sm text-foreground">
              {address.city} {address.postcode}
            </p>
            {address.access_notes && <p className="mt-2 text-sm text-muted-foreground">Access notes: {address.access_notes}</p>}
          </>
        )}
        {job.notes && <p className="mt-2 text-sm text-muted-foreground">Booking notes: {job.notes}</p>}

        {fullAddress && <JobMap address={fullAddress} />}

        <h2 className="mt-4 font-semibold text-foreground">Before the visit</h2>
        <ul className="mt-1 space-y-1 text-sm text-foreground">
          <li>{job.access_method === "keys" ? "Customer will provide keys" : "Customer will let the cleaner in"}</li>
          {job.has_pets && <li>Has pets</li>}
          <li className="text-muted-foreground">Parking nearby: {job.parking_available ? "Yes" : "No"}</li>
        </ul>

        {roomSelections.length > 0 && (
          <>
            <h2 className="mt-4 font-semibold text-foreground">Home size</h2>
            <ul className="mt-1 text-sm text-foreground">
              {roomSelections.map((r) => (
                <li key={r.id}>
                  {r.quantity} × {r.room_type_name}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
