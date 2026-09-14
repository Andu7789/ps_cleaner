import { createClient } from "@/lib/supabase/server";
import type { BusinessSettings } from "@/lib/types";

export async function getBusinessSettings(): Promise<BusinessSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_business_settings")
    .select("business_name, contact_email, contact_phone, timezone, reminder_hours_before, balance_charge_days_before")
    .eq("id", true)
    .maybeSingle();

  return (
    (data as BusinessSettings | null) ?? {
      business_name: "Cleaning Company",
      contact_email: null,
      contact_phone: null,
      timezone: "Europe/London",
      reminder_hours_before: 24,
      balance_charge_days_before: 2,
    }
  );
}
