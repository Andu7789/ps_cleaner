"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentBusiness } from "@/lib/business";
import { confirmBookingAndNotify, notifyBookingMoved } from "@/lib/booking-notify";
import { normaliseReference } from "@/lib/format";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cleaner, Service } from "@/lib/types";

export async function getAvailableSlotsAction(serviceId: string, date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ps_clean_available_slots", {
    p_service_id: serviceId,
    p_date: date,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as { cleaner_id: string; free_start: string; free_end: string }[];
}

const bookingSchema = z.object({
  cleanerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  fullName: z.string().trim().min(1, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address").max(200),
  phone: z.string().trim().min(6, "Please enter your phone number").max(30),
  line1: z.string().trim().min(1, "Please enter the first line of your address").max(200),
  line2: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().min(1, "Please enter your town or city").max(100),
  postcode: z.string().trim().min(2, "Please enter your postcode").max(12),
  accessNotes: z.string().trim().max(1000).optional().default(""),
  addonIds: z.array(z.string().uuid()).max(50).default([]),
  parkingAvailable: z.boolean().default(false),
  hasPets: z.boolean().default(false),
  accessMethod: z.enum(["keys", "let_in", "key_box"]).default("let_in"),
  roomSelections: z
    .array(z.object({ roomTypeId: z.string().uuid(), quantity: z.number().int().min(0).max(100) }))
    .max(50)
    .default([]),
});

export type CreateBookingInput = z.input<typeof bookingSchema>;

// Escapes the wildcards ilike would otherwise read in an email address.
function exactIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Customers have no accounts: a customer is whoever books with a given email
// at this business. Returns the most recent match so older duplicate rows
// (from when there were accounts) don't matter.
async function findCustomerByEmail(service: SupabaseClient, businessId: string, email: string) {
  const { data } = await service
    .from("PS_CLEAN_customers")
    .select("id")
    .eq("business_id", businessId)
    .ilike("email", exactIlike(email))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string } | null;
}

// Books a clean for a guest. The ps_clean_create_booking RPC is still the
// source of truth for "no double booking" (see DECISIONS.md #4). Nothing is
// paid online, so the booking is confirmed straight away and the customer is
// emailed their booking reference.
// A message meant for the customer. Anything else that goes wrong is logged
// and shown as a general "try again".
class CustomerError extends Error {}

// Errors are returned, not thrown: production replaces a thrown server action
// error with "Minified React error #441", so the customer would never see why.
async function asResult<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof CustomerError) return { error: err.message };
    console.error(err);
    return { error: "Something went wrong. Please try again, or give us a call." };
  }
}

export async function createBookingAction(raw: CreateBookingInput): Promise<{ reference: string } | { error: string }> {
  return asResult(() => createBooking(raw));
}

async function createBooking(raw: CreateBookingInput): Promise<{ reference: string }> {
  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) throw new CustomerError(parsed.error.issues[0]?.message ?? "Please check your details");
  const input = parsed.data;

  const business = await getCurrentBusiness();
  const service = createServiceClient();

  const { data: svc } = await service
    .from("PS_CLEAN_services")
    .select("id, walkthrough_first")
    .eq("id", input.serviceId)
    .eq("business_id", business.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!svc) throw new CustomerError("That clean isn't available to book.");

  let customer = await findCustomerByEmail(service, business.id, input.email);

  // Walkthrough first services are for returning customers only: someone who
  // has already booked with us (the walkthrough counts). New customers book the
  // walkthrough first and are quoted after the visit.
  if (svc.walkthrough_first) {
    const { count } = customer
      ? await service
          .from("PS_CLEAN_bookings")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", customer.id)
          .neq("status", "cancelled")
      : { count: 0 };
    if (!count) {
      throw new CustomerError(
        "We can't find an earlier booking for that email address. Please book a free walkthrough first, or use the email you booked with before."
      );
    }
  }

  if (customer) {
    await service
      .from("PS_CLEAN_customers")
      .update({ full_name: input.fullName, phone: input.phone, updated_at: new Date().toISOString() })
      .eq("id", customer.id);
  } else {
    const { data: created, error } = await service
      .from("PS_CLEAN_customers")
      .insert({ business_id: business.id, full_name: input.fullName, email: input.email, phone: input.phone })
      .select("id")
      .single();
    if (error) throw new CustomerError("We couldn't save your details. Please try again.");
    customer = created;
  }

  // Reuse the same home when it has been booked before, so details the owner
  // added to it (like a key box code) carry over to the next clean.
  const postcode = input.postcode.toUpperCase().replace(/\s+/g, " ");
  const { data: addresses } = await service
    .from("PS_CLEAN_customer_addresses")
    .select("id, line1, postcode")
    .eq("customer_id", customer.id);
  const sameHome = (addresses ?? []).find(
    (a) =>
      a.line1.trim().toLowerCase() === input.line1.toLowerCase() &&
      a.postcode.replace(/\s+/g, "").toUpperCase() === postcode.replace(/\s+/g, "")
  );
  let addressId = sameHome?.id;
  const addressFields = {
    line2: input.line2 || null,
    city: input.city,
    postcode,
    access_notes: input.accessNotes || null,
  };
  if (addressId) {
    await service.from("PS_CLEAN_customer_addresses").update(addressFields).eq("id", addressId);
  } else {
    const { data: created, error } = await service
      .from("PS_CLEAN_customer_addresses")
      .insert({
        business_id: business.id,
        customer_id: customer.id,
        label: "Home",
        line1: input.line1,
        ...addressFields,
        is_default: (addresses ?? []).length === 0,
      })
      .select("id")
      .single();
    if (error) throw new CustomerError("We couldn't save your address. Please try again.");
    addressId = created.id;
  }

  const { data: booking, error } = await service
    .rpc("ps_clean_create_booking", {
      p_customer_id: customer.id,
      p_cleaner_id: input.cleanerId,
      p_service_id: input.serviceId,
      p_address_id: addressId,
      p_starts_at: input.startsAt,
      p_notes: null,
      p_addon_ids: input.addonIds,
      p_parking_available: input.parkingAvailable,
      p_has_pets: input.hasPets,
      p_access_method: input.accessMethod,
      p_room_selections: input.roomSelections.map((r) => ({ room_type_id: r.roomTypeId, quantity: r.quantity })),
    })
    .single();
  if (error) throw new CustomerError(error.message);

  const row = booking as { id: string; reference: string };
  await confirmBookingAndNotify(service, row.id);
  revalidatePath("/admin/bookings");
  return { reference: row.reference };
}

export interface AmendableBooking {
  reference: string;
  serviceId: string;
  serviceName: string;
  cleanerName: string;
  startsAt: string;
  durationMinutes: number;
  status: string;
  canChange: boolean;
}

async function bookingByReference(reference: string) {
  const business = await getCurrentBusiness();
  const ref = normaliseReference(reference);
  if (ref.length !== 8) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("PS_CLEAN_bookings")
    .select("id, reference, service_id, status, starts_at, ends_at, PS_CLEAN_services(name), PS_CLEAN_cleaners(full_name)")
    .eq("business_id", business.id)
    .eq("reference", ref)
    .maybeSingle();
  return data;
}

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

// The customer's reference is their only proof of who they are, so this only
// ever hands back what they need to pick a new time.
export async function findBookingByReferenceAction(reference: string): Promise<AmendableBooking | null> {
  const data = await bookingByReference(reference);
  if (!data) return null;
  const svc = one(data.PS_CLEAN_services as { name: string } | { name: string }[] | null);
  const cleaner = one(data.PS_CLEAN_cleaners as { full_name: string } | { full_name: string }[] | null);
  return {
    reference: data.reference,
    serviceId: data.service_id,
    serviceName: svc?.name ?? "Clean",
    cleanerName: cleaner?.full_name ?? "your cleaner",
    startsAt: data.starts_at,
    durationMinutes: Math.round((new Date(data.ends_at).getTime() - new Date(data.starts_at).getTime()) / 60_000),
    status: data.status,
    canChange: (data.status === "confirmed" || data.status === "pending_payment") && new Date(data.starts_at) > new Date(),
  };
}

export async function rescheduleBookingAction(
  reference: string,
  cleanerId: string,
  startsAt: string
): Promise<AmendableBooking | { error: string }> {
  return asResult(() => rescheduleBooking(reference, cleanerId, startsAt));
}

async function rescheduleBooking(reference: string, cleanerId: string, startsAt: string): Promise<AmendableBooking> {
  if (!z.string().uuid().safeParse(cleanerId).success || !z.string().datetime({ offset: true }).safeParse(startsAt).success) {
    throw new CustomerError("Please pick a time from the calendar.");
  }
  const data = await bookingByReference(reference);
  if (!data) throw new CustomerError("We couldn't find a booking with that reference.");

  const service = createServiceClient();
  const previousStart = data.starts_at;
  const { error } = await service.rpc("ps_clean_reschedule_booking", {
    p_booking_id: data.id,
    p_cleaner_id: cleanerId,
    p_starts_at: startsAt,
  });
  if (error) throw new CustomerError(error.message);

  await notifyBookingMoved(service, data.id, previousStart);
  revalidatePath("/admin/bookings");
  const updated = await findBookingByReferenceAction(data.reference);
  if (!updated) throw new CustomerError("We couldn't find a booking with that reference.");
  return updated;
}

export interface RescheduleOptions {
  booking: AmendableBooking;
  service: Service;
  // Only what the calendar shows, not the cleaners' contact details.
  cleaners: Pick<Cleaner, "id" | "full_name" | "calendar_color" | "is_active">[];
}

// Everything the calendar needs to offer new times for a booking, found by
// its reference.
export async function getRescheduleOptionsAction(reference: string): Promise<RescheduleOptions | null> {
  const booking = await findBookingByReferenceAction(reference);
  if (!booking) return null;
  const service = createServiceClient();
  const [{ data: svc }, { data: links }] = await Promise.all([
    service.from("PS_CLEAN_services").select("*").eq("id", booking.serviceId).maybeSingle(),
    service
      .from("PS_CLEAN_cleaner_services")
      .select("PS_CLEAN_cleaners(id, full_name, calendar_color, is_active)")
      .eq("service_id", booking.serviceId),
  ]);
  if (!svc) return null;
  type C = RescheduleOptions["cleaners"][number];
  const cleaners = (links ?? [])
    .map((l) => one(l.PS_CLEAN_cleaners as C | C[] | null))
    .filter((c): c is C => Boolean(c?.is_active));
  return { booking, service: svc as Service, cleaners };
}
