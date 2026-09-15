"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getBusinessSettings } from "@/lib/business";
import { sendMagicLinkEmail } from "@/lib/notify";

export async function requestMagicLinkAction(email: string, next?: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // /auth/callback reads `next` off the same URL Supabase appends `code`
  // to and redirects there once the session is exchanged — this is how a
  // customer picking a slot, then signing in, lands back at checkout
  // instead of the generic /account page.
  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(next ?? "/account")}`;

  // Deliberately NOT supabase.auth.signInWithOtp() — that sends Supabase's
  // own built-in "Magic Link" email, whose template is a project-wide Auth
  // setting in this shared Supabase project that Root Café's app has
  // already branded for itself. generateLink() (service-role only) creates
  // the same PKCE link without sending anything, so PS Cleaning can email
  // it with its own branding instead. See DECISIONS.md.
  const service = createServiceClient();
  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (error) throw new Error(error.message);

  const actionLink = data.properties?.action_link;
  if (!actionLink) throw new Error("Couldn't generate a sign-in link");

  const settings = await getBusinessSettings();
  await sendMagicLinkEmail(settings.business_name, email, actionLink);
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
