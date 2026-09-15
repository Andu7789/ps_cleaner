"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function makeRecurringAction(bookingId: string, frequency: "weekly" | "fortnightly" | "monthly") {
  await requireCustomer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("ps_clean_create_recurring_booking", {
    p_booking_id: bookingId,
    p_frequency: frequency,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/account");
}

export async function pauseRecurringAction(recurringId: string, isActive: boolean) {
  await requireCustomer();
  const supabase = await createClient();
  const { error } = await supabase
    .from("PS_CLEAN_recurring_bookings")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", recurringId);
  if (error) throw new Error(error.message);
  revalidatePath("/account");
}
