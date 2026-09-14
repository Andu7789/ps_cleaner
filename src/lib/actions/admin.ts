"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("PS_CLEAN_bookings")
    .update({ starts_at: startsAt, ends_at: endsAt, updated_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/bookings");
}

export async function adminSetBookingStatusAction(bookingId: string, status: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("PS_CLEAN_bookings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/bookings");
}
