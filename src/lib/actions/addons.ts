"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";

export interface AddonInput {
  name: string;
  description?: string;
  pricePence: number;
}

export async function createAddonAction(input: AddonInput) {
  await requireAdmin();
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_addons").insert({
    business_id: business.id,
    name: input.name,
    description: input.description ?? null,
    price_pence: input.pricePence,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/addons");
}

export async function setAddonActiveAction(addonId: string, isActive: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_addons").update({ is_active: isActive }).eq("id", addonId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/addons");
}

export async function setServiceAddonAction(serviceId: string, addonId: string, offered: boolean) {
  await requireAdmin();
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  if (offered) {
    const { error } = await supabase
      .from("PS_CLEAN_service_addons")
      .upsert({ business_id: business.id, service_id: serviceId, addon_id: addonId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("PS_CLEAN_service_addons")
      .delete()
      .eq("service_id", serviceId)
      .eq("addon_id", addonId);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/admin/addons");
}
