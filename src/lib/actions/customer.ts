"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomer, requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { generateMagicLink } from "@/lib/magic-link";
import { sendMagicLinkEmail } from "@/lib/notify";
import { getStripe } from "@/lib/stripe";

function generateReferralCode(): string {
  // Short, shareable, unambiguous (no 0/O/1/I) — this is meant to be typed
  // or read aloud, not just clicked.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export async function requestMagicLinkAction(email: string, next?: string) {
  const business = await getCurrentBusiness();

  // Normalize case/whitespace before this email is used anywhere. Mobile
  // keyboards auto-capitalize the first letter of an email field by
  // default, and Resend's sandbox sender does a literal string match
  // against the account owner's email for its "testing emails only go to
  // yourself" restriction — "Andrew@x.com" typed on a phone doesn't match
  // "andrew@x.com" on file, even though they're the same address (found
  // live via Vercel logs after DECISIONS.md #15's fix still failed on a
  // real phone). Supabase itself already treats email case-insensitively,
  // so this only changes what we send to Resend/display, not auth lookups.
  const normalizedEmail = email.trim().toLowerCase();

  const link = await generateMagicLink(business, normalizedEmail, next ?? "/account");

  await sendMagicLinkEmail(business.business_name, normalizedEmail, link);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// Errors are returned, not thrown: production masks thrown server action
// errors as a generic "server error" page, hiding why the save failed.
export async function createCustomerProfileAction(
  fullName: string,
  phone: string,
  next?: string
): Promise<{ error: string } | undefined> {
  const user = await requireUser();
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const service = createServiceClient();

  // Resolve who referred this signup, if anyone — set by /r/[code], read
  // once and cleared here so it can't be reapplied to a later account.
  // Scoped to this business: a referral code from a different white-labeled
  // instance shouldn't silently link across businesses.
  const cookieStore = await cookies();
  const refCode = cookieStore.get("ps_clean_ref")?.value;
  let referredByCustomerId: string | null = null;
  if (refCode) {
    const { data: referrer } = await service
      .from("PS_CLEAN_customers")
      .select("id")
      .eq("referral_code", refCode.toUpperCase())
      .eq("business_id", business.id)
      .maybeSingle();
    referredByCustomerId = referrer?.id ?? null;
    cookieStore.delete("ps_clean_ref");
  }

  // Retry on the rare collision rather than pre-checking then inserting —
  // closes the same race a check-then-insert always has, for a cost of a
  // few extra attempts that will essentially never actually happen at 32^6
  // possible codes.
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from("PS_CLEAN_customers").insert({
      business_id: business.id,
      user_id: user.id,
      full_name: fullName,
      email: user.email,
      phone,
      referral_code: generateReferralCode(),
      referred_by_customer_id: referredByCustomerId,
    });
    if (!error) {
      redirect(next || "/account");
    }
    if (error.code === "23505" && error.message.includes("user_id")) {
      // Customer identity is global per login (see DECISIONS.md) — this
      // email already has a profile at a DIFFERENT white-labeled business.
      return {
        error: "This email already has an account with another PS Cleaning business. Please use a different email for this one.",
      };
    }
    if (error.code !== "23505") return { error: error.message };
    lastError = error.message;
  }
  return { error: lastError ?? "Couldn't create your account, please try again." };
}

// Only name and phone can be changed here. The email is the login, so it
// stays as it is. Scoped to the signed in customer's own row.
export async function updateCustomerDetailsAction(
  fullName: string,
  phone: string
): Promise<{ error: string } | { ok: true }> {
  const { customer } = await requireCustomer();
  const name = fullName.trim();
  const number = phone.trim();
  if (!name) return { error: "Enter your name." };
  if (!number) return { error: "Enter a phone number." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("PS_CLEAN_customers")
    .update({ full_name: name, phone: number })
    .eq("id", customer.id);
  if (error) return { error: "Couldn't save your details, please try again." };
  revalidatePath("/account");
  return { ok: true };
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
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { error } = await supabase.from("PS_CLEAN_customer_addresses").insert({
    business_id: business.id,
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

export interface AddressUpdate {
  label: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  accessNotes?: string;
  isDefault?: boolean;
}

// Errors are returned rather than thrown so the customer sees why.
export async function updateAddressAction(
  addressId: string,
  input: AddressUpdate
): Promise<{ error: string } | { ok: true }> {
  const { customer } = await requireCustomer();
  if (!input.line1.trim() || !input.city.trim() || !input.postcode.trim()) {
    return { error: "Address line 1, city and postcode are needed." };
  }
  const supabase = await createClient();
  if (input.isDefault) {
    await supabase.from("PS_CLEAN_customer_addresses").update({ is_default: false }).eq("customer_id", customer.id);
  }
  const { error } = await supabase
    .from("PS_CLEAN_customer_addresses")
    .update({
      label: input.label.trim() || "Home",
      line1: input.line1.trim(),
      line2: input.line2?.trim() || null,
      city: input.city.trim(),
      postcode: input.postcode.trim(),
      access_notes: input.accessNotes?.trim() || null,
      ...(input.isDefault ? { is_default: true } : {}),
    })
    .eq("id", addressId)
    .eq("customer_id", customer.id);
  if (error) return { error: "Couldn't save this address, please try again." };
  revalidatePath("/account/addresses");
  return { ok: true };
}

// Removes an address. One that an existing booking was made for can't be
// deleted outright (the booking needs it), so it is wiped of its details and
// hidden from the list instead.
export async function removeAddressAction(addressId: string): Promise<{ error: string } | { ok: true }> {
  const { customer } = await requireCustomer();
  const supabase = await createClient();
  const { error } = await supabase
    .from("PS_CLEAN_customer_addresses")
    .delete()
    .eq("id", addressId)
    .eq("customer_id", customer.id);
  if (error) {
    if (error.code === "23503") {
      return { error: "This address is on one of your bookings, so it can't be removed yet. Cancel or finish those bookings first." };
    }
    return { error: "Couldn't remove this address, please try again." };
  }
  revalidatePath("/account/addresses");
  return { ok: true };
}

// Deletes the signed in customer's account. Upcoming bookings are cancelled,
// everything personal is removed, and the login is deleted. Past bookings stay
// for the business's records but are no longer linked to a name, email, phone
// or address.
export async function deleteAccountAction(): Promise<{ error: string } | undefined> {
  const { user, customer } = await requireCustomer();
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: upcoming } = await supabase
    .from("PS_CLEAN_bookings")
    .select("id")
    .eq("customer_id", customer.id)
    .in("status", ["confirmed", "pending_payment"])
    .gte("starts_at", new Date().toISOString());
  for (const b of upcoming ?? []) {
    const { error } = await supabase.rpc("ps_clean_cancel_booking", {
      p_booking_id: b.id,
      p_reason: "Customer deleted their account",
    });
    if (error) return { error: "Couldn't cancel your upcoming bookings, so your account wasn't deleted. Please try again." };
  }

  if (customer.stripe_customer_id) {
    try {
      await getStripe().customers.del(customer.stripe_customer_id);
    } catch {
      // Already gone or not reachable, nothing more to do for Stripe.
    }
  }

  await service.from("PS_CLEAN_recurring_bookings").delete().eq("customer_id", customer.id);
  await service.from("PS_CLEAN_waitlist_entries").delete().eq("customer_id", customer.id);
  await service.from("PS_CLEAN_reviews").delete().eq("customer_id", customer.id);
  await service.from("PS_CLEAN_customer_credits").delete().eq("customer_id", customer.id);
  await service.from("PS_CLEAN_bookings").update({ notes: null }).eq("customer_id", customer.id);

  // Addresses on past bookings can't be deleted, so wipe them first and then
  // delete whichever ones nothing points at.
  const { data: addresses } = await service.from("PS_CLEAN_customer_addresses").select("id").eq("customer_id", customer.id);
  for (const a of addresses ?? []) {
    await service
      .from("PS_CLEAN_customer_addresses")
      .update({ label: "Removed", line1: "Removed", line2: null, city: "Removed", postcode: "Removed", access_notes: null })
      .eq("id", a.id);
    await service.from("PS_CLEAN_customer_addresses").delete().eq("id", a.id);
  }

  const { error: wipeError } = await service
    .from("PS_CLEAN_customers")
    .update({
      full_name: "Deleted customer",
      email: null,
      phone: null,
      stripe_customer_id: null,
      stripe_default_payment_method_id: null,
      referral_code: null,
      user_id: null,
    })
    .eq("id", customer.id);
  if (wipeError) return { error: "Couldn't delete your account, please try again." };

  const { error: authError } = await service.auth.admin.deleteUser(user.id);
  if (authError) return { error: "Your details were removed but we couldn't close your login. Please contact us." };

  await supabase.auth.signOut();
  redirect("/?accountDeleted=1");
}
