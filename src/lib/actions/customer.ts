"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function requestMagicLinkAction(email: string, next?: string) {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // middleware.ts reads `next` off the same URL Supabase appends `code` to
  // and redirects there once the session is exchanged — this is how a
  // customer picking a slot, then signing in, lands back at checkout
  // instead of the generic /account page.
  const redirectTo = `${siteUrl}/?next=${encodeURIComponent(next ?? "/account")}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(error.message);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function createCustomerProfileAction(fullName: string, phone: string, next?: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_customers").insert({
    user_id: user.id,
    full_name: fullName,
    email: user.email,
    phone,
  });
  if (error) throw new Error(error.message);
  redirect(next || "/account");
}

export interface AddressInput {
  label: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  accessNotes?: string;
  isDefault?: boolean;
}

export async function addAddressAction(customerId: string, input: AddressInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_customer_addresses").insert({
    customer_id: customerId,
    label: input.label,
    line1: input.line1,
    line2: input.line2 ?? null,
    city: input.city,
    postcode: input.postcode,
    access_notes: input.accessNotes ?? null,
    is_default: input.isDefault ?? false,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/account/addresses");
}

export async function deleteAddressAction(addressId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_customer_addresses").delete().eq("id", addressId);
  if (error) throw new Error(error.message);
  revalidatePath("/account/addresses");
}
