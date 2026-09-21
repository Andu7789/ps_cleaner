"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";

export interface PayoutSummary {
  bookingCount: number;
  totalMinutes: number;
  totalRevenuePence: number;
}

async function summarizeCompletedBookings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cleanerId: string,
  periodStart: string,
  periodEnd: string
): Promise<PayoutSummary> {
  const { data, error } = await supabase
    .from("PS_CLEAN_bookings")
    .select("starts_at, ends_at, price_pence")
    .eq("cleaner_id", cleanerId)
    .eq("status", "completed")
    .gte("starts_at", periodStart)
    .lt("starts_at", periodEnd);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const totalMinutes = rows.reduce(
    (sum, b) => sum + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000,
    0
  );
  const totalRevenuePence = rows.reduce((sum, b) => sum + b.price_pence, 0);
  return { bookingCount: rows.length, totalMinutes: Math.round(totalMinutes), totalRevenuePence };
}

export async function previewPayoutAction(cleanerId: string, periodStart: string, periodEnd: string): Promise<PayoutSummary> {
  await requireAdmin();
  const supabase = await createClient();
  return summarizeCompletedBookings(supabase, cleanerId, periodStart, periodEnd);
}

export async function recordPayoutAction(cleanerId: string, periodStart: string, periodEnd: string, notes?: string) {
  const admin = await requireAdmin();
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const summary = await summarizeCompletedBookings(supabase, cleanerId, periodStart, periodEnd);

  const { error } = await supabase.from("PS_CLEAN_cleaner_payouts").insert({
    business_id: business.id,
    cleaner_id: cleanerId,
    period_start: periodStart,
    period_end: periodEnd,
    booking_count: summary.bookingCount,
    total_minutes: summary.totalMinutes,
    total_revenue_pence: summary.totalRevenuePence,
    notes: notes ?? null,
    paid_by: admin.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/payouts");
}
