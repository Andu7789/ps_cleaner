"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getBusinessSettings } from "@/lib/business";
import { sendMagicLinkEmail } from "@/lib/notify";

function generateReferralCode(): string {
  // Short, shareable, unambiguous (no 0/O/1/I) — this is meant to be typed
  // or read aloud, not just clicked.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export async function requestMagicLinkAction(email: string, next?: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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

  // Deliberately NOT supabase.auth.signInWithOtp() — that sends Supabase's
  // own built-in "Magic Link" email, whose template is a project-wide Auth
  // setting in this shared Supabase project that Root Café's app has
  // already branded for itself. generateLink() (service-role only) creates
  // the token without sending anything, so PS Cleaning can email it with
  // its own branding instead. See DECISIONS.md #9.
  const service = createServiceClient();
  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
  });
  if (error) throw new Error(error.message);

  const hashedToken = data.properties?.hashed_token;
  if (!hashedToken) throw new Error("Couldn't generate a sign-in link");

  // Deliberately NOT data.properties.action_link either — that points at
  // Supabase's own /auth/v1/verify endpoint, which (with no PKCE code
  // challenge behind it, since this is an admin-generated link with no
  // browser involved yet) redirects back with the session in a URL
  // *fragment* (#access_token=...), not a `?code=` query param. A
  // fragment never reaches the server at all, so /auth/callback's old
  // exchangeCodeForSession(code) could never see it — this silently
  // broke every magic-link sign-in end to end (found while wiring up the
  // new cleaner login, then confirmed via curl that it broke customer/
  // admin login the exact same way). Building our own link with the raw
  // token_hash and verifying it ourselves via verifyOtp() in
  // /auth/callback sidesteps the whole implicit-vs-PKCE question — this
  // is Supabase's own documented pattern for a self-sent auth email.
  const link = `${siteUrl}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&next=${encodeURIComponent(next ?? "/account")}`;

  const settings = await getBusinessSettings();
  await sendMagicLinkEmail(settings.business_name, normalizedEmail, link);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function createCustomerProfileAction(fullName: string, phone: string, next?: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const service = createServiceClient();

  // Resolve who referred this signup, if anyone — set by /r/[code], read
  // once and cleared here so it can't be reapplied to a later account.
  const cookieStore = await cookies();
  const refCode = cookieStore.get("ps_clean_ref")?.value;
  let referredByCustomerId: string | null = null;
  if (refCode) {
    const { data: referrer } = await service
      .from("PS_CLEAN_customers")
      .select("id")
      .eq("referral_code", refCode.toUpperCase())
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
    if (error.code !== "23505") throw new Error(error.message);
    lastError = error.message;
  }
  throw new Error(lastError ?? "Couldn't create your account — please try again.");
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
