"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { generateMagicLink } from "@/lib/magic-link";
import { sendEmail } from "@/lib/notify";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import {
  checkSiteLive,
  emailOwnerTheirLink,
  loadRequestById,
  ownerLink,
  platformOrigin,
  provisionBusiness,
  sendWelcomeEmail,
} from "@/lib/onboarding-server";
import { validateAnswers, type LogEntry } from "@/lib/onboarding";
import { ensureConnectAccount, type PaymentMode } from "@/lib/stripe-connect";

// Sign in for the platform portal. Same email and password as any Supabase
// login, then requirePlatformAdmin() decides whether that person gets in.
export async function platformSignInAction(
  email: string,
  password: string,
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) return { error: "Incorrect email or password." };
  redirect("/platform");
}

// Emails a one time sign in link, and says nothing about whether the address
// is a platform admin.
export async function requestPlatformLoginLinkAction(email: string) {
  const normalized = email.trim().toLowerCase();
  const db = createServiceClient();
  const { data } = await db.from("PS_CLEAN_platform_admins").select("id").eq("email", normalized).maybeSingle();
  if (!data) return;
  const link = await generateMagicLink(await getCurrentBusiness(), normalized, "/platform");
  await sendEmail(
    normalized,
    "Sign in to the platform portal",
    `<div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <p>Click below to sign in to the platform portal.</p>
      <p><a href="${link}" style="color: #0f766e;">Sign in</a></p>
    </div>`,
  );
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface NewRequestInput {
  ownerName: string;
  ownerEmail: string;
  businessName: string;
  sendEmail: boolean;
}

export async function createOnboardingRequestAction(
  input: NewRequestInput,
): Promise<{ ok: true; id: string; link: string; emailed: boolean; emailError?: string } | { ok: false; error: string }> {
  await requirePlatformAdmin();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const ownerName = input.ownerName.trim();
  const businessName = input.businessName.trim();
  if (!businessName) return { ok: false, error: "Enter the business name." };
  if (input.sendEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    return { ok: false, error: "Enter the owner's email to send them the link." };
  }

  const db = createServiceClient();
  const token = newToken();
  // Pre-filled so the owner doesn't have to type what we already know.
  const answers = {
    ...(ownerName || ownerEmail ? { owner: { name: ownerName || undefined, email: ownerEmail || undefined } } : {}),
    business: { name: businessName },
  };
  const { data, error } = await db
    .from("PS_CLEAN_onboarding_requests")
    .insert({
      token,
      owner_name: ownerName || null,
      owner_email: ownerEmail || null,
      business_name: businessName,
      answers,
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the request." };

  const origin = await platformOrigin();
  let emailed = false;
  let emailError: string | undefined;
  if (input.sendEmail) {
    try {
      await emailOwnerTheirLink(data, origin);
      emailed = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : "The email didn't send.";
    }
  }
  revalidatePath("/platform");
  return { ok: true, id: data.id, link: ownerLink(origin, token), emailed, emailError };
}

export async function emailOwnerLinkAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin();
  const req = await loadRequestById(id);
  if (!req) return { ok: false, error: "Request not found." };
  try {
    await emailOwnerTheirLink(req, await platformOrigin());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The email didn't send." };
  }
}

export async function provisionAction(
  id: string,
  sendWelcome: boolean,
  paymentMode: PaymentMode,
): Promise<{ ok: boolean; error?: string; log: LogEntry[] }> {
  await requirePlatformAdmin();
  const result = await provisionBusiness(id, { sendWelcome, paymentMode: paymentMode === "connect" ? "connect" : "platform" });
  revalidatePath("/platform");
  revalidatePath(`/platform/${id}`);
  return result;
}

export async function resendWelcomeAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin();
  const req = await loadRequestById(id);
  if (!req?.business_id) return { ok: false, error: "This business hasn't been set up yet." };
  const checked = validateAnswers(req.answers);
  if (!checked.ok) return { ok: false, error: checked.errors.join(" ") };
  const db = createServiceClient();
  const { data: business } = await db
    .from("PS_CLEAN_businesses")
    .select("slug, custom_domain, business_name, payment_mode")
    .eq("id", req.business_id)
    .single();
  if (!business) return { ok: false, error: "Business not found." };
  try {
    await sendWelcomeEmail(business, checked.data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The email didn't send." };
  }
}

export async function checkSiteLiveAction(id: string): Promise<{ live: boolean; detail: string }> {
  await requirePlatformAdmin();
  const req = await loadRequestById(id);
  if (!req?.business_id) return { live: false, detail: "Not set up yet." };
  const db = createServiceClient();
  const { data: business } = await db
    .from("PS_CLEAN_businesses")
    .select("slug, custom_domain")
    .eq("id", req.business_id)
    .single();
  if (!business) return { live: false, detail: "Business not found." };
  return checkSiteLive(business);
}

// Switches where a live business's card payments go. Moving to connect makes
// the owner's Stripe account (they finish verification from Settings); moving
// back to platform just stops routing, so nothing in flight is lost.
export async function setPaymentModeAction(id: string, mode: PaymentMode): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin();
  const req = await loadRequestById(id);
  if (!req?.business_id) return { ok: false, error: "This business hasn't been set up yet." };
  const db = createServiceClient();
  try {
    if (mode === "connect") {
      const { data: business } = await db
        .from("PS_CLEAN_businesses")
        .select("id, business_name, contact_email, stripe_connect_account_id")
        .eq("id", req.business_id)
        .single();
      if (!business) return { ok: false, error: "Business not found." };
      await ensureConnectAccount(db, business);
    }
    const { error } = await db.from("PS_CLEAN_businesses").update({ payment_mode: mode }).eq("id", req.business_id);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't switch payments." };
  }
  revalidatePath(`/platform/${id}`);
  return { ok: true };
}

// Lets the owner correct something after sending it in, before it's set up.
export async function reopenRequestAction(id: string) {
  await requirePlatformAdmin();
  const db = createServiceClient();
  await db
    .from("PS_CLEAN_onboarding_requests")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "submitted");
  revalidatePath(`/platform/${id}`);
  revalidatePath("/platform");
}

export async function archiveRequestAction(id: string) {
  await requirePlatformAdmin();
  const db = createServiceClient();
  await db
    .from("PS_CLEAN_onboarding_requests")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "provisioned");
  revalidatePath("/platform");
  redirect("/platform");
}
