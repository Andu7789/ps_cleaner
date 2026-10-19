import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { accessMethodLabel, customerMinutes, findWalkthroughService, formatDate, formatDuration, formatTime } from "@/lib/format";
import { JobMap } from "@/components/cleaner/job-map";
import { JobPricing } from "@/components/admin/job-pricing";
import { KeyBoxForm } from "@/components/admin/key-box-form";
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

  const { data: serviceRows } = await supabase
    .from("PS_CLEAN_services")
    .select("*")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("price_pence", { ascending: true });
  const allServices = (serviceRows ?? []) as Service[];
  const walkthrough = findWalkthroughService(allServices);
  const pricingServices = allServices
    .filter((s) => s.id !== walkthrough?.id)
    .map((s) => ({ id: s.id, name: s.name, hourly_rate_pence: s.hourly_rate_pence, price_pence: s.price_pence }));

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
        <p className="text-sm text-muted-foreground">
          Reference: <span className="font-mono text-foreground">{job.reference}</span>
        </p>
        <span className="mt-2 inline-block text-xs capitalize text-muted-foreground">{job.status.replace("_", " ")}</span>
      </div>

      {job.status !== "cancelled" && (
        <div className="mt-4">
          <h2 className="mb-2 font-semibold text-foreground">Pricing</h2>
          <JobPricing
            bookingId={job.id}
            services={pricingServices}
            initial={{
              serviceRequiredId: job.service_required_id ?? null,
              hoursRequired: job.hours_required == null ? null : Number(job.hours_required),
              paymentFormat: job.payment_format ?? null,
              estimatedPricePence: job.estimated_price_pence ?? null,
              finalPricePence: job.final_price_pence ?? null,
            }}
            quoteSentAt={job.quote_sent_at ?? null}
            invoiceSentAt={job.invoice_sent_at ?? null}
            completed={job.status === "completed"}
            stacked
          />
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
            <KeyBoxForm addressId={address.id} initialCode={address.key_box_code ?? null} />
          </>
        )}
        {job.notes && <p className="mt-2 text-sm text-muted-foreground">Booking notes: {job.notes}</p>}

        {fullAddress && <JobMap address={fullAddress} />}

        <h2 className="mt-4 font-semibold text-foreground">Before the visit</h2>
        <ul className="mt-1 space-y-1 text-sm text-foreground">
          <li>{accessMethodLabel(job.access_method, "customer")}</li>
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
