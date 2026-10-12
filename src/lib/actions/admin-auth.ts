"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { generateMagicLink } from "@/lib/magic-link";
import { sendMagicLinkEmail } from "@/lib/notify";

const MIN_PASSWORD_LENGTH = 10;

export async function adminSignInAction(email: string, password: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  // One message for wrong email and wrong password alike, so this can't be
  // used to find out which emails have accounts.
  if (error) throw new Error("Incorrect email or password.");
  // requireAdmin() on /admin bounces non-admins back with a clear error.
  redirect("/admin");
}

// Used for first-time setup (invites) and "forgot password". The emailed link
// signs them in once and lands on the set-password page; the link is the only
// thing that bypasses the password, and only to let them choose a new one.
// Always resolves the same way whether or not the email is an admin.
export async function requestAdminPasswordSetupAction(email: string) {
  const business = await getCurrentBusiness();
  const normalizedEmail = email.trim().toLowerCase();
  const service = createServiceClient();
  const { data: admin } = await service
    .from("PS_CLEAN_admin_users")
    .select("id")
    .ilike("email", normalizedEmail)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!admin) return;

  const link = await generateMagicLink(business, normalizedEmail, "/admin/set-password");
  await sendMagicLinkEmail(business.business_name, normalizedEmail, link);
}

export async function setAdminPasswordAction(password: string) {
  await requireAdmin();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
  redirect("/admin");
}
