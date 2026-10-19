"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getCurrentBusiness } from "@/lib/business";
import { formatDate, formatTime } from "@/lib/format";
import { sendInvoiceEmail, sendQuoteEmail, type QuoteOrInvoiceEmail } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

// The owner prices a job from the bookings list: which clean it needs, how
// many hours, how it is paid, the estimate (emailed as a quote) and, once the
// job is done, the final price (emailed as an invoice). These return an error
// instead of throwing, since production hides thrown server action messages.

const pricingSchema = z.object({
  serviceRequiredId: z.string().uuid().nullable(),
  hoursRequired: z.number().positive("Hours must be more than 0").max(100, "Hours must be 100 or less").nullable(),
  paymentFormat: z.enum(["set_price", "hourly"]).nullable(),
  estimatedPricePence: z.number().int().min(0).max(10_000_000).nullable(),
  finalPricePence: z.number().int().min(0).max(10_000_000).nullable(),
});

export type JobPricingInput = z.infer<typeof pricingSchema>;

type Result = { error: string } | { ok: true; message?: string };

async function save(bookingId: string, input: JobPricingInput): Promise<{ error: string } | undefined> {
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the pricing details" };
  const v = parsed.data;
  const business = await getCurrentBusiness();
  const supabase = await createClient();

  if (v.serviceRequiredId) {
    const { data: svc } = await supabase
      .from("PS_CLEAN_services")
      .select("id")
      .eq("id", v.serviceRequiredId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (!svc) return { error: "That service isn't one of yours" };
  }

  const { error } = await supabase
    .from("PS_CLEAN_bookings")
    .update({
      service_required_id: v.serviceRequiredId,
      hours_required: v.hoursRequired,
      payment_format: v.paymentFormat,
      estimated_price_pence: v.estimatedPricePence,
      final_price_pence: v.finalPricePence,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("business_id", business.id);
  if (error) return { error: error.message };
}

export async function saveJobPricingAction(bookingId: string, input: JobPricingInput): Promise<Result> {
  await requireAdmin();
  const failed = await save(bookingId, input);
  if (failed) return failed;
  revalidatePath("/admin/bookings");
  return { ok: true, message: "Saved" };
}

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

type EmailRow = {
  reference: string;
  starts_at: string;
  hours_required: number | null;
  payment_format: "set_price" | "hourly" | null;
  estimated_price_pence: number | null;
  final_price_pence: number | null;
  status: string;
  PS_CLEAN_customers: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  PS_CLEAN_customer_addresses:
    | { line1: string; city: string; postcode: string }
    | { line1: string; city: string; postcode: string }[]
    | null;
  PS_CLEAN_services: { name: string } | { name: string }[] | null;
  service_required_id: string | null;
};

async function emailDetails(bookingId: string): Promise<{ error: string } | { row: EmailRow; email: Omit<QuoteOrInvoiceEmail, "amountPence"> }> {
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_bookings")
    .select(
      "reference, starts_at, hours_required, payment_format, estimated_price_pence, final_price_pence, status, PS_CLEAN_customers(full_name, email), PS_CLEAN_customer_addresses(line1, city, postcode), service_required_id, PS_CLEAN_services(name)"
    )
    .eq("id", bookingId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!data) return { error: "Booking not found" };
  const row = data as unknown as EmailRow;
  const customer = one(row.PS_CLEAN_customers);
  if (!customer?.email) return { error: "This customer has no email address" };
  const address = one(row.PS_CLEAN_customer_addresses);
  const { data: required } = row.service_required_id
    ? await supabase
        .from("PS_CLEAN_services")
        .select("name, hourly_rate_pence")
        .eq("id", row.service_required_id)
        .eq("business_id", business.id)
        .maybeSingle()
    : { data: null };
  return {
    row,
    email: {
      businessName: business.business_name,
      customerEmail: customer.email,
      customerName: customer.full_name,
      reference: row.reference,
      serviceName: required?.name.trim() ?? one(row.PS_CLEAN_services)?.name ?? "Clean",
      dateLine: `${formatDate(row.starts_at)} at ${formatTime(row.starts_at)}`,
      addressLine: address ? `${address.line1}, ${address.city} ${address.postcode}` : "",
      hours: row.hours_required,
      paymentFormat: row.payment_format,
      hourlyRatePence: required?.hourly_rate_pence ?? null,
      replyTo: business.contact_email,
      contactPhone: business.contact_phone,
    },
  };
}

// Saves what is on screen, then emails the estimate to the customer.
export async function sendQuoteAction(bookingId: string, input: JobPricingInput): Promise<Result> {
  await requireAdmin();
  if (!input.serviceRequiredId) return { error: "Choose the service required first" };
  if (input.estimatedPricePence == null) return { error: "Add the hours so there is an estimated price" };
  const failed = await save(bookingId, input);
  if (failed) return failed;

  const details = await emailDetails(bookingId);
  if ("error" in details) return details;
  try {
    await sendQuoteEmail({ ...details.email, amountPence: input.estimatedPricePence });
  } catch (err) {
    return { error: `The quote didn't send: ${err instanceof Error ? err.message : String(err)}` };
  }

  const supabase = await createClient();
  await supabase.from("PS_CLEAN_bookings").update({ quote_sent_at: new Date().toISOString() }).eq("id", bookingId);
  revalidatePath("/admin/bookings");
  return { ok: true, message: `Quote emailed to ${details.email.customerEmail}` };
}

// Saves the final price and emails the invoice. The booking's price becomes
// the final price so reports count what was actually charged.
export async function generateInvoiceAction(bookingId: string, input: JobPricingInput): Promise<Result> {
  await requireAdmin();
  if (input.finalPricePence == null) return { error: "Enter the final price first" };
  const failed = await save(bookingId, input);
  if (failed) return failed;

  const details = await emailDetails(bookingId);
  if ("error" in details) return details;
  if (details.row.status === "cancelled") return { error: "This booking was cancelled" };
  try {
    await sendInvoiceEmail({ ...details.email, amountPence: input.finalPricePence });
  } catch (err) {
    return { error: `The invoice didn't send: ${err instanceof Error ? err.message : String(err)}` };
  }

  const supabase = await createClient();
  await supabase
    .from("PS_CLEAN_bookings")
    .update({ invoice_sent_at: new Date().toISOString(), price_pence: input.finalPricePence })
    .eq("id", bookingId);
  revalidatePath("/admin/bookings");
  return { ok: true, message: `Invoice ${details.row.reference} emailed to ${details.email.customerEmail}` };
}
