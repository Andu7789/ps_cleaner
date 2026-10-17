"use server";

import { redirect } from "next/navigation";
import { requireCleaner } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { generateMagicLink } from "@/lib/magic-link";
import { sendMagicLinkEmail } from "@/lib/notify";

const MIN_PASSWORD_LENGTH = 10;

// Errors are returned, not thrown: in production Next masks thrown server
// action errors, so the form would show a minified React error instead.
export async function cleanerSignInAction(
  email: string,
  password: string,
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  // One message for wrong email and wrong password alike, so this can't be
  // used to find out which emails have accounts.
  if (error) return { error: "Incorrect email or password." };
  // requireCleaner() on /cleaner links the account and bounces anyone who
  // isn't an active cleaner back to the login page with a clear error.
  redirect("/cleaner");
}

// First time setup and "forgot password". The emailed link signs them in once
// and lands on the set password page; it is the only thing that bypasses the
// password. Resolves the same way whether or not the email is a cleaner.
export async function requestCleanerPasswordSetupAction(email: string) {
  const business = await getCurrentBusiness();
  const normalizedEmail = email.trim().toLowerCase();
  const service = createServiceClient();
  const { data: cleaner } = await service
    .from("PS_CLEAN_cleaners")
    .select("id")
    .ilike("email", normalizedEmail)
    .eq("business_id", business.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!cleaner) return;

  const link = await generateMagicLink(business, normalizedEmail, "/cleaner/set-password");
  await sendMagicLinkEmail(business.business_name, normalizedEmail, link, business.contact_email);
}

export async function setCleanerPasswordAction(
  password: string,
): Promise<{ error: string } | undefined> {
  await requireCleaner();
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/cleaner");
}
