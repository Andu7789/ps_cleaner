"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { PayRateType } from "@/lib/types";

interface EligibleBooking {
  id: string;
  starts_at: string;
  ends_at: string;
  price_pence: number;
  PS_CLEAN_services: { name: string } | null;
}

// Cents-precision rounding at the line-item level (not just the total) so
// an invoice's line items always sum exactly to its total — no rounding
// remainder to explain to a cleaner being paid down to the penny.
function computePayable(
  booking: { price_pence: number; starts_at: string; ends_at: string },
  payRateType: PayRateType,
  payRateValue: number
): number {
  if (payRateType === "percentage") return Math.round((booking.price_pence * payRateValue) / 100);
  if (payRateType === "hourly") {
    const hours = (new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 3_600_000;
    return Math.round(hours * payRateValue);
  }
  return Math.round(payRateValue);
}

export interface InvoicePreviewLine {
  bookingId: string;
  date: string;
  serviceName: string;
  amountPence: number;
}

export interface InvoicePreview {
  lines: InvoicePreviewLine[];
  totalPence: number;
}

async function buildPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cleanerId: string,
  periodStart: string,
  periodEnd: string
): Promise<InvoicePreview> {
  const { data: cleaner, error: cleanerError } = await supabase
    .from("PS_CLEAN_cleaners")
    .select("pay_rate_type, pay_rate_value")
    .eq("id", cleanerId)
    .single();
  if (cleanerError) throw new Error(cleanerError.message);

  // Excludes bookings already on an invoice — a booking can only ever be
  // paid out once (also enforced at the DB level, see migration 0023).
  const { data: alreadyInvoiced } = await supabase
    .from("PS_CLEAN_cleaner_invoice_items")
    .select("booking_id")
    .not("booking_id", "is", null);
  const invoicedIds = new Set((alreadyInvoiced ?? []).map((r) => r.booking_id as string));

  const { data: bookings, error } = await supabase
    .from("PS_CLEAN_bookings")
    .select("id, starts_at, ends_at, price_pence, PS_CLEAN_services(name)")
    .eq("cleaner_id", cleanerId)
    .eq("status", "completed")
    .gte("starts_at", periodStart)
    .lt("starts_at", periodEnd)
    .order("starts_at");
  if (error) throw new Error(error.message);

  const lines: InvoicePreviewLine[] = ((bookings ?? []) as unknown as EligibleBooking[])
    .filter((b) => !invoicedIds.has(b.id))
    .map((b) => ({
      bookingId: b.id,
      date: b.starts_at,
      serviceName: b.PS_CLEAN_services?.name ?? "Clean",
      amountPence: computePayable(b, cleaner.pay_rate_type as PayRateType, cleaner.pay_rate_value as number),
    }));

  return { lines, totalPence: lines.reduce((sum, l) => sum + l.amountPence, 0) };
}

export async function previewInvoiceAction(cleanerId: string, periodStart: string, periodEnd: string): Promise<InvoicePreview> {
  await requireAdmin();
  const supabase = await createClient();
  return buildPreview(supabase, cleanerId, periodStart, periodEnd);
}

export async function generateInvoiceAction(
  cleanerId: string,
  periodStart: string,
  periodEnd: string,
  notes?: string
): Promise<string> {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const { lines, totalPence } = await buildPreview(supabase, cleanerId, periodStart, periodEnd);
  if (lines.length === 0) throw new Error("No uninvoiced completed jobs in this period");

  const { data: invoice, error } = await supabase
    .from("PS_CLEAN_cleaner_invoices")
    .insert({
      cleaner_id: cleanerId,
      period_start: periodStart,
      period_end: periodEnd,
      total_pence: totalPence,
      notes: notes ?? null,
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { error: itemsError } = await supabase.from("PS_CLEAN_cleaner_invoice_items").insert(
    lines.map((l) => ({
      invoice_id: invoice.id,
      booking_id: l.bookingId,
      description: `${l.serviceName} — ${formatDate(l.date)}`,
      amount_pence: l.amountPence,
    }))
  );
  if (itemsError) throw new Error(itemsError.message);

  revalidatePath("/admin/invoices");
  return invoice.id as string;
}

export async function markInvoicePaidAction(invoiceId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("PS_CLEAN_cleaner_invoices")
    .update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoice/${invoiceId}`);
}

export async function voidInvoiceAction(invoiceId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Also removes this invoice's line items, not just flips its status —
  // otherwise the unique constraint tying a booking to at most one invoice
  // (migration 0023) would permanently block those jobs from ever being
  // invoiced again, even after voiding a mistake. The invoice header
  // itself (number, period, total) is kept as the audit trail; only the
  // per-job breakdown is released back to be re-invoiced.
  const { error: itemsError } = await supabase.from("PS_CLEAN_cleaner_invoice_items").delete().eq("invoice_id", invoiceId);
  if (itemsError) throw new Error(itemsError.message);

  const { error } = await supabase
    .from("PS_CLEAN_cleaner_invoices")
    .update({ status: "void", updated_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoice/${invoiceId}`);
}

export async function updateCleanerPayRateAction(cleanerId: string, payRateType: PayRateType, payRateValue: number) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("PS_CLEAN_cleaners")
    .update({ pay_rate_type: payRateType, pay_rate_value: payRateValue, updated_at: new Date().toISOString() })
    .eq("id", cleanerId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/cleaners/${cleanerId}`);
}
