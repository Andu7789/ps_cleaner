"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { platformAdminEmails } from "@/lib/platform-auth";
import {
  loadRequestByToken,
  notifyPlatformSubmitted,
  platformOrigin,
} from "@/lib/onboarding-server";
import { draftSchema, slugSchema, validateAnswers, type Draft } from "@/lib/onboarding";

// Actions the business owner's intake form calls. There is no login: the
// secret link token is the credential, and every action re-checks it. Errors
// are returned rather than thrown so production doesn't mask the message.

const LOGO_BUCKET = "ps_clean_business_logos";
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const LOGO_MAX_BYTES = 800 * 1024; // stays under the 1MB server action body limit

type Result = { ok: true } | { ok: false; error: string };

async function editableRequest(token: string) {
  const req = await loadRequestByToken(token);
  if (!req) return { ok: false, error: "This link isn't valid. Ask for a fresh one." } as const;
  if (req.status === "provisioned" || req.status === "archived") {
    return { ok: false, error: "This business has already been set up, so this form is closed." } as const;
  }
  return { ok: true, req } as const;
}

export async function saveDraftAction(token: string, answers: unknown): Promise<Result & { savedAt?: string }> {
  const found = await editableRequest(token);
  if (!found.ok) return { ok: false, error: found.error };
  const { req } = found;

  if (typeof answers !== "object" || answers === null) return { ok: false, error: "Nothing to save." };

  // Section by section, so a half typed email can't throw away the rest of the
  // form: an invalid section keeps what was saved before and the next save,
  // once the field is finished, replaces it.
  const incoming = answers as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...req.answers };
  for (const key of Object.keys(draftSchema.shape) as (keyof typeof draftSchema.shape)[]) {
    if (!(key in incoming)) continue;
    const section = draftSchema.shape[key].safeParse(incoming[key]);
    if (section.success) merged[key] = section.data;
  }
  const saved = merged as Draft;

  const db = createServiceClient();
  const savedAt = new Date().toISOString();
  const { error } = await db
    .from("PS_CLEAN_onboarding_requests")
    .update({
      answers: saved,
      owner_name: saved.owner?.name || req.owner_name,
      owner_email: saved.owner?.email || req.owner_email,
      business_name: saved.business?.name || req.business_name,
      // Sending it in is a deliberate step, so saving after that reopens it.
      status: req.status === "invited" || req.status === "submitted" ? "in_progress" : req.status,
      updated_at: savedAt,
    })
    .eq("id", req.id);
  if (error) return { ok: false, error: "Couldn't save just now. Try again." };
  return { ok: true, savedAt };
}

export async function checkSlugAction(
  token: string,
  slug: string,
): Promise<{ available: boolean; message: string }> {
  const found = await editableRequest(token);
  if (!found.ok) return { available: false, message: found.error };

  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return { available: false, message: parsed.error.issues[0]?.message ?? "Not a valid address." };

  const db = createServiceClient();
  const [business, otherRequest] = await Promise.all([
    db.from("PS_CLEAN_businesses").select("id").eq("slug", parsed.data).maybeSingle(),
    db
      .from("PS_CLEAN_onboarding_requests")
      .select("id")
      .eq("answers->address->>slug", parsed.data)
      .neq("id", found.req.id)
      .neq("status", "archived")
      .limit(1),
  ]);
  if (business.data || (otherRequest.data?.length ?? 0) > 0) {
    return { available: false, message: "Someone already has that address. Try another." };
  }
  return { available: true, message: "That address is free." };
}

// Stores the logo plus a square icon (made in the browser, same as the admin
// settings page) and returns their public URLs. The form keeps the URLs in
// its answers and saves them with everything else.
export async function uploadLogoAction(
  token: string,
  formData: FormData,
): Promise<{ ok: true; logoUrl: string; iconUrl: string } | { ok: false; error: string }> {
  const found = await editableRequest(token);
  if (!found.ok) return { ok: false, error: found.error };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file was received." };
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { ok: false, error: "The logo must be a PNG, JPG, WebP or SVG image." };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: "The logo must be under 800KB." };

  const stamp = Date.now();
  const bucket = createServiceClient().storage.from(LOGO_BUCKET);
  const path = `intake/${found.req.id}/logo-${stamp}.${ext}`;
  const { error } = await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) return { ok: false, error: "The upload didn't work. Try again." };

  let iconUrl = "";
  const icon = formData.get("icon");
  if (icon instanceof File && icon.type === "image/png" && icon.size <= LOGO_MAX_BYTES) {
    const iconPath = `intake/${found.req.id}/icon-${stamp}.png`;
    const { error: iconError } = await bucket.upload(iconPath, icon, { contentType: "image/png", cacheControl: "31536000" });
    if (!iconError) iconUrl = bucket.getPublicUrl(iconPath).data.publicUrl;
  }
  return { ok: true, logoUrl: bucket.getPublicUrl(path).data.publicUrl, iconUrl };
}

export async function submitOnboardingAction(token: string): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const found = await editableRequest(token);
  if (!found.ok) return { ok: false, errors: [found.error] };
  const { req } = found;

  const checked = validateAnswers(req.answers);
  if (!checked.ok) return { ok: false, errors: checked.errors };

  const db = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await db
    .from("PS_CLEAN_onboarding_requests")
    .update({
      status: "submitted",
      submitted_at: now,
      updated_at: now,
      owner_name: checked.data.owner.name,
      owner_email: checked.data.owner.email,
      business_name: checked.data.business.name,
    })
    .eq("id", req.id);
  if (error) return { ok: false, errors: ["Couldn't send that in just now. Try again."] };

  // The owner's submission has succeeded whether or not the heads up email does.
  try {
    await notifyPlatformSubmitted(
      { ...req, business_name: checked.data.business.name, owner_name: checked.data.owner.name },
      await platformOrigin(),
      await platformAdminEmails(),
    );
  } catch (err) {
    console.error("Onboarding submitted email failed", err);
  }
  return { ok: true };
}
