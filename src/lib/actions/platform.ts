"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_BUSINESS_SLUG, getCurrentBusiness } from "@/lib/business";
import { generateMagicLink } from "@/lib/magic-link";
import { sendEmail } from "@/lib/notify";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { LOGO_BUCKET, cleanUpAfterDelete, removeFolder, type DeleteSummary } from "@/lib/delete-business";
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
import { CHECKLIST, type CheckStatus } from "@/lib/checklist-items";
import { runChecklist } from "@/lib/platform-checklist";

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
): Promise<{ ok: boolean; error?: string; log: LogEntry[] }> {
  await requirePlatformAdmin();
  const result = await provisionBusiness(id, { sendWelcome });
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
    .select("slug, custom_domain, business_name")
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

export type DeleteMode = "business" | "everything";

export interface DeleteResult {
  ok: boolean;
  error?: string;
  message?: string;
  warnings?: string[];
}

// Permanently removes a business and everything in it. Typing the address (or
// the name, for a request that has no business yet) is the safety catch, and
// it is checked here rather than trusted from the browser. The main business
// can never be deleted.
//   "business":   removes the business but keeps the owner's answers, so it
//                 can be set up again from the same request.
//   "everything": removes the business and the request with it.
export async function deleteBusinessAction(id: string, mode: DeleteMode, confirmation: string): Promise<DeleteResult> {
  await requirePlatformAdmin();
  const req = await loadRequestById(id);
  if (!req) return { ok: false, error: "Request not found." };
  if (mode === "business" && !req.business_id) return { ok: false, error: "There's no business to delete yet." };

  const db = createServiceClient();
  let slug: string | null = null;
  if (req.business_id) {
    const { data } = await db.from("PS_CLEAN_businesses").select("slug").eq("id", req.business_id).maybeSingle();
    slug = (data?.slug as string | undefined) ?? null;
  }
  if (slug === DEFAULT_BUSINESS_SLUG) return { ok: false, error: "The main business can't be deleted." };

  const expected = (slug ?? req.business_name ?? "").trim().toLowerCase();
  if (!expected || confirmation.trim().toLowerCase() !== expected) {
    return { ok: false, error: `Type "${slug ?? req.business_name}" exactly to confirm.` };
  }

  let warnings: string[] = [];
  let message = "";
  if (req.business_id && slug) {
    const { data, error } = await db.rpc("ps_clean_delete_business", { p_business_id: req.business_id });
    if (error) {
      const missing = /ps_clean_delete_business|function/i.test(error.message) && /not exist|find|schema cache/i.test(error.message);
      return {
        ok: false,
        error: missing ? "The delete function isn't installed yet. Run migration 0049 in Supabase first." : error.message,
      };
    }
    const summary = data as DeleteSummary;
    warnings = await cleanUpAfterDelete(db, req.business_id, summary, mode === "everything" ? [`intake/${req.id}`] : []);
    message = `Deleted ${slug}: ${summary.bookings} bookings, ${summary.customers} customers, ${summary.cleaners} cleaners, ${summary.services} services, ${summary.payments} payments.`;
  } else {
    await removeFolder(db, LOGO_BUCKET, `intake/${req.id}`).catch(() => undefined);
    message = "Deleted the request.";
  }

  if (mode === "everything") {
    await db.from("PS_CLEAN_onboarding_requests").delete().eq("id", req.id);
  } else {
    // Back to "ready to set up", so the same answers can be provisioned again.
    await db
      .from("PS_CLEAN_onboarding_requests")
      .update({
        status: "submitted",
        business_id: null,
        provision_log: [],
        provisioned_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.id);
  }
  revalidatePath("/platform");
  // The page of a request that no longer exists must not be re-rendered.
  if (mode === "business") revalidatePath(`/platform/${id}`);
  return { ok: true, message, warnings };
}

// ---- Checklist

// Runs every automatic check and returns the answers. Read only: nothing
// here changes Stripe, DNS, email or any business.
export async function runChecklistAction(): Promise<{ results: Record<string, { status: CheckStatus; detail: string }>; checkedAt: string }> {
  await requirePlatformAdmin();
  const results = await runChecklist(createServiceClient());
  return { results, checkedAt: new Date().toISOString() };
}

export async function setChecklistItemAction(key: string, done: boolean): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin();
  const item = CHECKLIST.find((i) => i.key === key && i.kind === "manual");
  if (!item) return { ok: false, error: "That item can't be ticked by hand." };
  const { error } = await createServiceClient()
    .from("PS_CLEAN_platform_checklist")
    .upsert({ item_key: key, done, updated_at: new Date().toISOString() }, { onConflict: "item_key" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/platform/checklist");
  return { ok: true };
}

// ---- Platform admins

export async function addPlatformAdminAction(email: string): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin();
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return { ok: false, error: "Enter a valid email address." };
  const { error } = await createServiceClient().from("PS_CLEAN_platform_admins").insert({ email: normalized });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "That email is already a platform admin." : error.message };
  }
  revalidatePath("/platform/admins");
  return { ok: true };
}

// An admin can't remove themselves, and the last admin can't be removed, so
// the portal can never be left with nobody able to sign in.
export async function removePlatformAdminAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requirePlatformAdmin();
  const db = createServiceClient();
  const { data: admins } = await db.from("PS_CLEAN_platform_admins").select("id, email, user_id");
  const target = admins?.find((a) => a.id === id);
  if (!target) return { ok: false, error: "Admin not found." };
  if ((admins?.length ?? 0) <= 1) return { ok: false, error: "You can't remove the last platform admin." };
  if (target.user_id === me.id || target.email === me.email?.toLowerCase()) {
    return { ok: false, error: "You can't remove yourself. Ask another admin to do it." };
  }
  const { error } = await db.from("PS_CLEAN_platform_admins").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/platform/admins");
  return { ok: true };
}
