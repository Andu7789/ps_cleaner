import { createServiceClient } from "@/lib/supabase/server";
import { getBusinessOrigin, getCurrentBusiness } from "@/lib/business";
import { generateMagicLink } from "@/lib/magic-link";
import { sendEmail } from "@/lib/notify";
import { hourlyPricePence } from "@/lib/format";
import { ensureConnectAccount, type PaymentMode } from "@/lib/stripe-connect";
import {
  TOKEN_PATTERN,
  poundsToPence,
  validateAnswers,
  type Answers,
  type LogEntry,
  type OnboardingRequest,
} from "@/lib/onboarding";

// Server only helpers for the onboarding flow: loading requests, the
// provisioning run, and the emails around it. Always uses the service role,
// so callers must have checked the owner's token or the platform admin first.

const TABLE = "PS_CLEAN_onboarding_requests";
const CALENDAR_COLORS = ["#2563eb", "#db2777", "#16a34a", "#ea580c", "#7c3aed", "#0891b2", "#ca8a04", "#dc2626"];
const DEFAULT_ROOM_TYPES = ["Bedroom", "Bathroom", "Living room", "Kitchen"];

export async function loadRequestByToken(token: string): Promise<OnboardingRequest | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const service = createServiceClient();
  const { data } = await service.from(TABLE).select("*").eq("token", token).maybeSingle();
  return (data as OnboardingRequest | null) ?? null;
}

export async function loadRequestById(id: string): Promise<OnboardingRequest | null> {
  const service = createServiceClient();
  const { data } = await service.from(TABLE).select("*").eq("id", id).maybeSingle();
  return (data as OnboardingRequest | null) ?? null;
}

export async function platformOrigin(): Promise<string> {
  return getBusinessOrigin(await getCurrentBusiness());
}

export function ownerLink(origin: string, token: string): string {
  return `${origin}/start/${token}`;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shell(heading: string, body: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; color: #111827;">
      <h1 style="font-size: 18px; margin-bottom: 16px;">${esc(heading)}</h1>
      ${body}
    </div>
  `;
}

function button(href: string, label: string): string {
  return `<p><a href="${href}" style="display: inline-block; background: #0f766e; color: #ffffff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600;">${esc(label)}</a></p>`;
}

export async function emailOwnerTheirLink(req: OnboardingRequest, origin: string): Promise<void> {
  if (!req.owner_email) throw new Error("This request has no owner email yet.");
  const first = (req.owner_name ?? "").trim().split(/\s+/)[0];
  const body = `
    <p>${first ? `Hi ${esc(first)},` : "Hi,"}</p>
    <p>Let's get ${req.business_name ? esc(req.business_name) : "your business"} set up with its own online booking site. It takes about ten minutes, you can stop and come back any time, and nothing is final until you press send at the end.</p>
    ${button(ownerLink(origin, req.token), "Start setting up")}
    <p style="font-size: 12px; color: #5b6b68;">This link is just for you. Anything you can't answer yet, skip it, you can change it all once your site is live.</p>`;
  await sendEmail(req.owner_email, "Let's set up your booking site", shell("Set up your booking site", body));
}

export async function notifyPlatformSubmitted(req: OnboardingRequest, origin: string, to: string[]): Promise<void> {
  const name = req.business_name ?? "A new business";
  const body = `
    <p>${esc(name)} has finished the setup form${req.owner_name ? ` (${esc(req.owner_name)})` : ""}.</p>
    ${button(`${origin}/platform/${req.id}`, "Review and set up")}`;
  await Promise.all(to.map((email) => sendEmail(email, `${name} is ready to set up`, shell("Ready to set up", body))));
}

function entry(step: string, ok: boolean, detail: string): LogEntry {
  return { step, ok, detail, at: new Date().toISOString() };
}

async function saveLog(id: string, log: LogEntry[], extra: Record<string, unknown> = {}) {
  const service = createServiceClient();
  await service
    .from(TABLE)
    .update({ provision_log: log, updated_at: new Date().toISOString(), ...extra })
    .eq("id", id);
}

function siteHost(business: { slug: string; custom_domain: string | null }): string {
  return business.custom_domain ?? `${business.slug}.psclean.site`;
}

// Whether the new site answers on its address yet. Not part of setting up the
// data, so a "no" here is a to do (DNS), not a failure.
export async function checkSiteLive(business: { slug: string; custom_domain: string | null }): Promise<{ live: boolean; detail: string }> {
  const host = siteHost(business);
  try {
    const res = await fetch(`https://${host}/`, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) });
    return res.status < 500
      ? { live: true, detail: `https://${host} answered (${res.status}).` }
      : { live: false, detail: `https://${host} returned ${res.status}.` };
  } catch {
    return { live: false, detail: `https://${host} isn't reachable yet. Check the DNS record and domain are set up.` };
  }
}

type Service = ReturnType<typeof createServiceClient>;
interface Ctx {
  db: Service;
  req: OnboardingRequest;
  a: Answers;
  businessId: string;
}

async function stepBusiness(db: Service, req: OnboardingRequest, a: Answers): Promise<{ businessId: string; detail: string }> {
  if (req.business_id) return { businessId: req.business_id, detail: "Business already created." };

  const slugClash = await db.from("PS_CLEAN_businesses").select("id").eq("slug", a.address.slug).maybeSingle();
  if (slugClash.data) throw new Error(`The address "${a.address.slug}" is already taken. Change it on the request and try again.`);
  if (a.address.customDomain) {
    const domainClash = await db.from("PS_CLEAN_businesses").select("id").eq("custom_domain", a.address.customDomain).maybeSingle();
    if (domainClash.data) throw new Error(`The domain "${a.address.customDomain}" is already used by another business.`);
  }

  const { data, error } = await db
    .from("PS_CLEAN_businesses")
    .insert({
      slug: a.address.slug,
      business_name: a.business.name,
      custom_domain: a.address.customDomain || null,
      brand_color: a.brand.color,
      header_style: a.brand.headerStyle,
      logo_url: a.brand.logoUrl || null,
      icon_url: a.brand.logoUrl ? a.brand.iconUrl || null : null,
      contact_email: a.business.contactEmail || a.owner.email,
      contact_phone: a.business.contactPhone || a.owner.phone || null,
      timezone: a.hours.timezone,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't create the business.");

  // Saved straight away so a later failure can resume against this business.
  await db.from(TABLE).update({ business_id: data.id }).eq("id", req.id);
  return { businessId: data.id as string, detail: `Created ${a.business.name} at ${a.address.slug}.` };
}

async function stepOwner({ db, a, businessId }: Ctx): Promise<string> {
  const { data: existing } = await db
    .from("PS_CLEAN_admin_users")
    .select("id")
    .eq("business_id", businessId)
    .eq("email", a.owner.email)
    .maybeSingle();
  if (existing) return "Owner invite already exists.";
  const { error } = await db
    .from("PS_CLEAN_admin_users")
    .insert({ business_id: businessId, email: a.owner.email, role: "owner", display_name: a.owner.name });
  if (error) throw new Error(error.message);
  return `Invited ${a.owner.email} as owner.`;
}

async function stepServices({ db, a, businessId }: Ctx): Promise<string> {
  const { data: existing } = await db.from("PS_CLEAN_services").select("name").eq("business_id", businessId);
  const have = new Set((existing ?? []).map((s) => (s.name as string).toLowerCase()));

  const rows = a.services
    .filter((s) => !have.has(s.name.toLowerCase()))
    .map((s) => {
      const pence = poundsToPence(s.price);
      const hourly = s.pricing === "hourly";
      return {
        business_id: businessId,
        name: s.name,
        description: s.description || null,
        duration_minutes: s.minutes,
        buffer_before_minutes: 0,
        buffer_after_minutes: s.travelMinutes,
        price_pence: hourly ? hourlyPricePence(pence, s.minutes) : pence,
        hourly_rate_pence: hourly ? pence : null,
        requires_quote: s.pricing === "quote",
        price_is_from: s.pricing === "quote",
        // The free visit asks for room counts so the cleaner can price the job.
        use_calculator: s.walkthrough,
        rooms_no_charge: s.walkthrough,
      };
    });
  if (rows.length > 0) {
    const { error } = await db.from("PS_CLEAN_services").insert(rows);
    if (error) throw new Error(error.message);
  }

  if (a.services.some((s) => s.walkthrough)) {
    const { data: rooms } = await db.from("PS_CLEAN_calculator_room_types").select("id").eq("business_id", businessId).limit(1);
    if (!rooms || rooms.length === 0) {
      const { error } = await db.from("PS_CLEAN_calculator_room_types").insert(
        DEFAULT_ROOM_TYPES.map((name, i) => ({
          business_id: businessId,
          name,
          price_per_unit_pence: 0,
          minutes_per_unit: 0,
          sort_order: i,
        })),
      );
      if (error) throw new Error(error.message);
    }
  }
  return `Added ${rows.length} service${rows.length === 1 ? "" : "s"}.`;
}

async function stepTeam({ db, a, businessId }: Ctx): Promise<string> {
  const wanted = [
    ...(a.team.ownerCleans ? [{ name: a.owner.name, email: a.owner.email, phone: a.owner.phone }] : []),
    ...a.team.cleaners.map((c) => ({ name: c.name, email: c.email, phone: c.phone })),
  ];
  const { data: existing } = await db.from("PS_CLEAN_cleaners").select("full_name, email").eq("business_id", businessId);
  const haveNames = new Set((existing ?? []).map((c) => (c.full_name as string).toLowerCase()));
  const haveEmails = new Set((existing ?? []).map((c) => ((c.email as string | null) ?? "").toLowerCase()).filter(Boolean));

  const rows = wanted
    .filter((c) => !haveNames.has(c.name.toLowerCase()) && !(c.email && haveEmails.has(c.email.toLowerCase())))
    .map((c, i) => ({
      business_id: businessId,
      full_name: c.name,
      email: c.email || null,
      phone: c.phone || null,
      calendar_color: CALENDAR_COLORS[((existing?.length ?? 0) + i) % CALENDAR_COLORS.length],
    }));
  if (rows.length > 0) {
    const { error } = await db.from("PS_CLEAN_cleaners").insert(rows);
    if (error) throw new Error(error.message);
  }

  // Everyone can do everything to start with, the owner narrows it later.
  const [{ data: cleaners }, { data: services }] = await Promise.all([
    db.from("PS_CLEAN_cleaners").select("id").eq("business_id", businessId),
    db.from("PS_CLEAN_services").select("id").eq("business_id", businessId),
  ]);
  const links = (cleaners ?? []).flatMap((c) =>
    (services ?? []).map((s) => ({ business_id: businessId, cleaner_id: c.id, service_id: s.id })),
  );
  if (links.length > 0) {
    const { error } = await db
      .from("PS_CLEAN_cleaner_services")
      .upsert(links, { onConflict: "cleaner_id,service_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return `Added ${rows.length} cleaner${rows.length === 1 ? "" : "s"} and set them up for every service.`;
}

async function stepHours({ db, a, businessId }: Ctx): Promise<string> {
  const { data: cleaners } = await db.from("PS_CLEAN_cleaners").select("id").eq("business_id", businessId);
  const { data: withHours } = await db.from("PS_CLEAN_cleaner_working_hours").select("cleaner_id").eq("business_id", businessId);
  const done = new Set((withHours ?? []).map((h) => h.cleaner_id as string));

  const days = a.hours.days.filter((d) => d.on);
  const rows = (cleaners ?? [])
    .filter((c) => !done.has(c.id as string))
    .flatMap((c) =>
      days.map((d) => ({
        business_id: businessId,
        cleaner_id: c.id,
        day_of_week: d.day,
        start_time: d.start,
        end_time: d.end,
        timezone: a.hours.timezone,
      })),
    );
  if (rows.length > 0) {
    const { error } = await db.from("PS_CLEAN_cleaner_working_hours").insert(rows);
    if (error) throw new Error(error.message);
  }
  return `Set working hours on ${days.length} day${days.length === 1 ? "" : "s"}.`;
}

// Gives the business its own Stripe account when it should be paid directly.
// Kept out of the main steps: if Stripe Connect isn't switched on yet the
// business can still go live on platform payments and be switched later.
async function stepPayments({ db, businessId }: Ctx, mode: PaymentMode): Promise<string> {
  if (mode === "platform") return "Card payments stay on the platform Stripe account.";
  const { data: business } = await db
    .from("PS_CLEAN_businesses")
    .select("id, business_name, contact_email, stripe_connect_account_id")
    .eq("id", businessId)
    .single();
  if (!business) throw new Error("Business not found.");
  const accountId = await ensureConnectAccount(db, business);
  const { error } = await db.from("PS_CLEAN_businesses").update({ payment_mode: "connect" }).eq("id", businessId);
  if (error) throw new Error(error.message);
  return `Created Stripe account ${accountId}. The owner finishes verification from Settings.`;
}

export async function sendWelcomeEmail(
  business: { slug: string; custom_domain: string | null; business_name: string; payment_mode?: PaymentMode },
  a: Pick<Answers, "owner">,
): Promise<void> {
  const origin = getBusinessOrigin(business);
  const link = await generateMagicLink(business, a.owner.email, "/admin/set-password");
  const first = a.owner.name.trim().split(/\s+/)[0];
  const payments =
    business.payment_mode === "connect"
      ? `<li>Set up your payouts so card payments reach your own account: <a href="${origin}/admin/payments/connect" style="color: #0f766e;">set up payouts</a>. It takes about five minutes, and customers can't pay by card until it's done.</li>`
      : "<li>Card payments are already taken care of.</li>";
  const body = `
    <p>Hi ${esc(first)},</p>
    <p>${esc(business.business_name)} now has its own booking site, already filled in with what you told us.</p>
    ${button(link, "Set your password and sign in")}
    <p>Your site: <a href="${origin}" style="color: #0f766e;">${origin}</a><br>
    Your admin: <a href="${origin}/admin/login" style="color: #0f766e;">${origin}/admin/login</a></p>
    <p><strong>Already done for you</strong></p>
    <ul>
      <li>Your name, logo and brand colour</li>
      <li>Your services and prices</li>
      <li>Your team and their working hours</li>
    </ul>
    <p><strong>Good first things to do</strong></p>
    <ul>
      <li>Open Services and check the prices and times look right.</li>
      <li>Add add-ons, photos and anything else you want customers to see.</li>
      <li>Invite any other staff from Team.</li>
      ${payments}
    </ul>
    <p style="font-size: 12px; color: #5b6b68;">The password button works once and expires. If it stops working, use "Forgot password" on the admin sign in page.</p>`;
  await sendEmail(a.owner.email, `${business.business_name} is ready`, shell(`${business.business_name} is ready`, body));
}

export interface ProvisionResult {
  ok: boolean;
  error?: string;
  log: LogEntry[];
}

// Sets up everything the owner's answers describe. Safe to run again after a
// failure: steps that already succeeded are skipped, and each step only adds
// what is missing, so nothing is duplicated.
export async function provisionBusiness(
  requestId: string,
  opts: { sendWelcome: boolean; paymentMode: PaymentMode },
): Promise<ProvisionResult> {
  const db = createServiceClient();
  const req = await loadRequestById(requestId);
  if (!req) return { ok: false, error: "Request not found.", log: [] };
  if (req.status !== "submitted" && req.status !== "provisioned") {
    return { ok: false, error: "The owner hasn't sent this in yet.", log: req.provision_log };
  }

  const checked = validateAnswers(req.answers);
  if (!checked.ok) return { ok: false, error: checked.errors.join(" "), log: req.provision_log };
  const a = checked.data;

  let log = [...req.provision_log];
  const ok = (step: string) => log.some((e) => e.step === step && e.ok);
  const record = async (e: LogEntry) => {
    log = [...log.filter((x) => x.step !== e.step), e];
    await saveLog(req.id, log);
  };

  let businessId = req.business_id;
  const steps: [string, (c: Ctx) => Promise<string>][] = [
    ["owner", stepOwner],
    ["services", stepServices],
    ["team", stepTeam],
    ["hours", stepHours],
  ];

  try {
    if (!ok("business") || !businessId) {
      const made = await stepBusiness(db, req, a);
      businessId = made.businessId;
      await record(entry("business", true, made.detail));
    }
    for (const [name, run] of steps) {
      if (ok(name)) continue;
      const detail = await run({ db, req, a, businessId: businessId! });
      await record(entry(name, true, detail));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    const failedStep = ["business", ...steps.map(([n]) => n)].find((n) => !ok(n)) ?? "setup";
    await record(entry(failedStep, false, message));
    return { ok: false, error: `${failedStep}: ${message}`, log };
  }

  if (!ok("payments")) {
    try {
      await record(entry("payments", true, await stepPayments({ db, req, a, businessId: businessId! }, opts.paymentMode)));
    } catch (err) {
      await record(entry("payments", false, err instanceof Error ? err.message : "Couldn't set up payments."));
    }
  }

  const { data: business } = await db
    .from("PS_CLEAN_businesses")
    .select("slug, custom_domain, business_name, payment_mode")
    .eq("id", businessId!)
    .single();

  if (business) {
    if (opts.sendWelcome && !ok("welcome")) {
      try {
        await sendWelcomeEmail(business, a);
        await record(entry("welcome", true, `Emailed ${a.owner.email}.`));
      } catch (err) {
        await record(entry("welcome", false, err instanceof Error ? err.message : "The email didn't send."));
      }
    }
    const live = await checkSiteLive(business);
    await record(entry("live", live.live, live.detail));
  }

  await saveLog(req.id, log, { status: "provisioned", provisioned_at: req.provisioned_at ?? new Date().toISOString() });
  return { ok: true, log };
}
