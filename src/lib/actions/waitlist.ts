"use server";

import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// cleanerId omitted/undefined means "any cleaner qualified for this
// service" — matched against every cancellation on that day/service, not
// just one specific person's schedule.
export async function joinWaitlistAction(serviceId: string, wantedDate: string, cleanerId?: string): Promise<void> {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("PS_CLEAN_waitlist_entries")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("service_id", serviceId)
    .eq("wanted_date", wantedDate)
    .is("notified_at", null)
    .maybeSingle();
  if (existing) return; // already waiting for this day — nothing more to do

  const { error } = await supabase.from("PS_CLEAN_waitlist_entries").insert({
    customer_id: customer.id,
    service_id: serviceId,
    cleaner_id: cleanerId ?? null,
    wanted_date: wantedDate,
  });
  if (error) throw new Error(error.message);
}
