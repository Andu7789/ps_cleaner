"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireOwner } from "@/lib/auth";
import type { AdminRole } from "@/lib/types";
import { getCurrentBusiness } from "@/lib/business";
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
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_cleaners").insert({
    business_id: business.id,
    full_name: input.fullName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    bio: input.bio ?? null,
    calendar_color: input.calendarColor ?? "#2563eb",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cleaners");
}

export async function updateCleanerDetailsAction(cleanerId: string, input: CleanerInput) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("PS_CLEAN_cleaners")
    .update({
      full_name: input.fullName,
      email: input.email || null,
      phone: input.phone || null,
      bio: input.bio || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cleanerId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/cleaners/${cleanerId}`);
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
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_services").insert({
    business_id: business.id,
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
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  if (qualified) {
    const { error } = await supabase
      .from("PS_CLEAN_cleaner_services")
      .upsert({ business_id: business.id, cleaner_id: cleanerId, service_id: serviceId });
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
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_cleaner_working_hours").insert({
    business_id: business.id,
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
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_cleaner_time_off").insert({
    business_id: business.id,
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

export interface BusinessSettingsInput {
  businessName: string;
  contactEmail?: string;
  contactPhone?: string;
  timezone: string;
  reminderHoursBefore: number;
  balanceChargeDaysBefore: number;
}

// Owner-only, matching the RLS write policy on PS_CLEAN_businesses' write
// path (service-role/owner only — see migration 0029/0031) — a regular
// admin can read these values same as the public site does, but only the
// owner can change them. Updates THIS request's own business row (the one
// requireOwner() just verified they own), never a business_id from the
// client.
export async function updateBusinessSettingsAction(input: BusinessSettingsInput) {
  await requireOwner();
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { error } = await supabase
    .from("PS_CLEAN_businesses")
    .update({
      business_name: input.businessName,
      contact_email: input.contactEmail || null,
      contact_phone: input.contactPhone || null,
      timezone: input.timezone,
      reminder_hours_before: input.reminderHoursBefore,
      balance_charge_days_before: input.balanceChargeDaysBefore,
    })
    .eq("id", business.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/settings");
  revalidatePath("/");
}

// "Build your experience" pricing calculator — off by default, admin
// opts a service in explicitly rather than it appearing automatically.
export async function setServiceCalculatorAction(serviceId: string, useCalculator: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("PS_CLEAN_services")
    .update({ use_calculator: useCalculator, updated_at: new Date().toISOString() })
    .eq("id", serviceId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/services");
}

export async function createRoomTypeAction(name: string, pricePerUnitPence: number, minutesPerUnit = 0) {
  await requireAdmin();
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_calculator_room_types").insert({
    business_id: business.id,
    name,
    price_per_unit_pence: pricePerUnitPence,
    minutes_per_unit: minutesPerUnit,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/services");
}

// A real delete, not a deactivate — PS_CLEAN_booking_calculator_selections
// snapshots the room type's name/price at booking time and its FK is ON
// DELETE SET NULL, so removing a room type here can never corrupt a
// historical booking's record of what was actually charged.
export async function deleteRoomTypeAction(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_calculator_room_types").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/services");
}

// Admin team management — owner-only (matches PS_CLEAN_admin_users' RLS
// write policy). Invites by email rather than requiring a user_id, since
// the invited person hasn't necessarily signed in (or even has an account)
// yet — linked to their real auth user on first sign-in, same pattern as
// a cleaner (DECISIONS.md #3), see requireAdmin()/getAdminRecord().
export interface InviteAdminInput {
  email: string;
  displayName?: string;
  role: AdminRole;
}

export async function inviteAdminAction(input: InviteAdminInput) {
  await requireOwner();
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_admin_users").insert({
    business_id: business.id,
    email: input.email.trim().toLowerCase(),
    display_name: input.displayName?.trim() || null,
    role: input.role,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}

export async function updateAdminRoleAction(id: string, role: AdminRole) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_admin_users").update({ role }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}

// Two safety checks a raw delete wouldn't have: an owner can't accidentally
// remove their own access (would need a second owner to undo it), and the
// last remaining owner can never be removed (would leave no one able to
// manage admins at all — RLS makes admin_users writes owner-only).
export async function removeAdminAction(id: string) {
  const owner = await requireOwner();
  const business = await getCurrentBusiness();
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("PS_CLEAN_admin_users")
    .select("user_id, role")
    .eq("id", id)
    .maybeSingle();
  if (!target) throw new Error("Admin not found");
  if (target.user_id === owner.id) throw new Error("You can't remove your own admin access.");

  if (target.role === "owner") {
    // Scoped to THIS business — an owner elsewhere (you, running another
    // test instance) must never count toward "is there still an owner here".
    const { count } = await supabase
      .from("PS_CLEAN_admin_users")
      .select("id", { count: "exact", head: true })
      .eq("role", "owner")
      .eq("business_id", business.id);
    if ((count ?? 0) <= 1) throw new Error("Can't remove the last owner.");
  }

  const { error } = await supabase.from("PS_CLEAN_admin_users").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}
