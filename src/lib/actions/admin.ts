"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { notifyWaitlistOnCancellation } from "@/lib/bookings";
import { applySucceededPaymentIntent } from "@/lib/payments";
import { getStripe } from "@/lib/stripe";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// Records who changed what on a booking and from/to what value — so a
// rescheduled or status-changed booking can always be explained later.
// Best-effort: a logging failure must never block the override itself,
// which has already succeeded by the time this runs.
async function logBookingChange(
  supabase: SupabaseClient,
  actor: User,
  bookingId: string,
  field: string,
  oldValue: string | null,
  newValue: string | null
) {
  try {
    const { data: admin } = await supabase
      .from("PS_CLEAN_admin_users")
      .select("display_name")
      .eq("user_id", actor.id)
      .maybeSingle();

    await supabase.from("PS_CLEAN_admin_change_log").insert({
      booking_id: bookingId,
      field,
      old_value: oldValue,
      new_value: newValue,
      actor_user_id: actor.id,
      actor_name: admin?.display_name ?? actor.email ?? null,
    });
  } catch {
    // The override itself already succeeded by the time this runs — a
    // failed audit-log write shouldn't be treated as the override failing.
  }
}

export interface CleanerInput {
  fullName: string;
  email?: string;
  phone?: string;
  bio?: string;
  calendarColor?: string;
}

export async function createCleanerAction(input: CleanerInput) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_cleaners").insert({
    full_name: input.fullName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    bio: input.bio ?? null,
    calendar_color: input.calendarColor ?? "#2563eb",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cleaners");
}

export async function setCleanerActiveAction(cleanerId: string, isActive: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("PS_CLEAN_cleaners")
    .update({ is_active: isActive })
    .eq("id", cleanerId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cleaners");
}

export interface ServiceInput {
  name: string;
  description?: string;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  pricePence: number;
  depositPence?: number | null;
}

export async function createServiceAction(input: ServiceInput) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_services").insert({
    name: input.name,
    description: input.description ?? null,
    duration_minutes: input.durationMinutes,
    buffer_before_minutes: input.bufferBeforeMinutes ?? 0,
    buffer_after_minutes: input.bufferAfterMinutes ?? 0,
    price_pence: input.pricePence,
    deposit_pence: input.depositPence ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/services");
}

export async function setServiceActiveAction(serviceId: string, isActive: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_services").update({ is_active: isActive }).eq("id", serviceId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/services");
}

export async function setCleanerQualificationAction(cleanerId: string, serviceId: string, qualified: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  if (qualified) {
    const { error } = await supabase
      .from("PS_CLEAN_cleaner_services")
      .upsert({ cleaner_id: cleanerId, service_id: serviceId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("PS_CLEAN_cleaner_services")
      .delete()
      .eq("cleaner_id", cleanerId)
      .eq("service_id", serviceId);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/admin/cleaners");
}

export interface WorkingHoursInput {
  cleanerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export async function addWorkingHoursAction(input: WorkingHoursInput) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_cleaner_working_hours").insert({
    cleaner_id: input.cleanerId,
    day_of_week: input.dayOfWeek,
    start_time: input.startTime,
    end_time: input.endTime,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cleaners");
}

export async function deleteWorkingHoursAction(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_cleaner_working_hours").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cleaners");
}

export interface TimeOffInput {
  cleanerId: string;
  startsAt: string;
  endsAt: string;
  reason?: string;
}

export async function addTimeOffAction(input: TimeOffInput) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_cleaner_time_off").insert({
    cleaner_id: input.cleanerId,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    reason: input.reason ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cleaners");
}

export async function deleteTimeOffAction(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_cleaner_time_off").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cleaners");
}

// A manual override: writes to PS_CLEAN_bookings directly (the "bookings
// admin write" RLS policy allows this) rather than going through
// ps_clean_create_booking, since an admin overriding a slot deliberately
// needs to bypass that RPC's own working-hours validation. The EXCLUDE
// constraint still applies regardless — an admin can move a job to a time
// outside normal hours, but never onto a slot that's actually double-booked.
export async function adminRescheduleBookingAction(bookingId: string, startsAt: string, endsAt: string) {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("PS_CLEAN_bookings")
    .select("starts_at, ends_at")
    .eq("id", bookingId)
    .maybeSingle();

  const { error } = await supabase
    .from("PS_CLEAN_bookings")
    .update({ starts_at: startsAt, ends_at: endsAt, updated_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (error) throw new Error(error.message);

  if (before && (before.starts_at !== startsAt || before.ends_at !== endsAt)) {
    await logBookingChange(
      supabase,
      admin,
      bookingId,
      "schedule",
      `${before.starts_at} – ${before.ends_at}`,
      `${startsAt} – ${endsAt}`
    );
  }

  revalidatePath("/admin/bookings");
}

export async function adminSetBookingStatusAction(bookingId: string, status: string) {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("PS_CLEAN_bookings")
    .select("status")
    .eq("id", bookingId)
    .maybeSingle();

  const { error } = await supabase
    .from("PS_CLEAN_bookings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (error) throw new Error(error.message);

  if (before && before.status !== status) {
    await logBookingChange(supabase, admin, bookingId, "status", before.status, status);
  }

  if (before && before.status !== "cancelled" && status === "cancelled") {
    await notifyWaitlistOnCancellation(createServiceClient(), bookingId);
  }

  revalidatePath("/admin/bookings");
}

export interface ReconcileResult {
  outcome: "confirmed" | "still_pending" | "payment_failed" | "no_payment_found";
  message: string;
}

// Manually re-checks a booking's payment against Stripe and applies the
// same reconciliation the webhook would have — the recovery path for when
// the webhook never reached us (most commonly in local dev with no `stripe
// listen` running; see DECISIONS.md #10/#11, this happened for real during
// this app's own testing). Safe to run on any booking at any time: it only
// ever reads Stripe's current truth and applies it, never guesses.
export async function reconcilePaymentAction(bookingId: string): Promise<ReconcileResult> {
  await requireAdmin();
  const service = createServiceClient();

  const { data: payment } = await service
    .from("PS_CLEAN_payments")
    .select("stripe_payment_intent_id")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment?.stripe_payment_intent_id) {
    return { outcome: "no_payment_found", message: "No payment has been started for this booking yet." };
  }

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);

  if (intent.status === "succeeded") {
    await applySucceededPaymentIntent(service, intent);
    revalidatePath("/admin/bookings");
    return { outcome: "confirmed", message: "Payment had succeeded on Stripe — booking is now confirmed." };
  }

  if (intent.status === "canceled" || intent.last_payment_error) {
    return {
      outcome: "payment_failed",
      message: intent.last_payment_error?.message ?? "Payment was not completed.",
    };
  }

  return { outcome: "still_pending", message: `Stripe still shows this as "${intent.status}" — not paid yet.` };
}
