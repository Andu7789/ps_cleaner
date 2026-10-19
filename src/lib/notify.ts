import { formatDate, formatPence, formatTime } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";

export interface NotifyBookingContext {
  bookingId: string;
  businessName: string;
  serviceName: string;
  cleanerName: string;
  startsAt: string;
  addressLine: string;
  pricePence: number;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  // True while the owner still has to confirm the price; nothing has been taken.
  quotePending?: boolean;
  // The business's own contact email, so replies reach them.
  replyTo?: string | null;
  // What the customer quotes to change the booking, and where they do it.
  reference?: string;
  amendUrl?: string;
}

// Every business sends from the one verified address, but shows its own name
// as the sender and gets replies at its own contact email.
export interface Sender {
  name?: string | null;
  replyTo?: string | null;
}

// The bare address out of NOTIFY_FROM_EMAIL, which may be written either as
// "bookings@psclean.site" or as "Name <bookings@psclean.site>".
export function fromAddress(configured: string | undefined): string {
  const value = (configured ?? "bookings@example.com").trim();
  const match = value.match(/<([^<>]+)>/);
  return (match ? match[1] : value).trim();
}

// A display name safe to put in a header: no line breaks, quotes or angle
// brackets, so a business name can never break out of the From line.
export function buildFrom(configured: string | undefined, name?: string | null): string {
  const address = fromAddress(configured);
  const clean = (name ?? "").replace(/[\r\n\t]+/g, " ").replace(/["<>\\]/g, "").trim().slice(0, 80);
  return clean ? `"${clean}" <${address}>` : address;
}

export function validReplyTo(value?: string | null): string | undefined {
  const email = (value ?? "").trim();
  return /^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$/.test(email) ? email : undefined;
}

export async function sendEmail(to: string, subject: string, html: string, sender?: Sender): Promise<{ id?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("Email isn't configured (RESEND_API_KEY missing)");

  const replyTo = validReplyTo(sender?.replyTo);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: buildFrom(process.env.NOTIFY_FROM_EMAIL, sender?.name),
      to,
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend request failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id?: string };
}

async function sendSms(to: string, body: string): Promise<{ sid?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) throw new Error("SMS isn't configured (Twilio env vars missing)");

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio request failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { sid?: string };
}

// Deliberately NOT Supabase's built-in signInWithOtp email — that template
// lives in this shared Supabase project's Auth settings (Dashboard >
// Authentication > Email Templates), which Root Café's app has already
// customized ("Sign in to Root Café") for its own use. That setting is
// project-wide, not per-app, so PS Cleaning generates its own magic link
// via the admin API (see requestMagicLinkAction) and sends it through this
// email instead, rather than touching a template another live app depends
// on. See DECISIONS.md.
export async function sendMagicLinkEmail(
  businessName: string,
  email: string,
  actionLink: string,
  replyTo?: string | null
): Promise<void> {
  const html = emailShell(
    businessName,
    `<p>Click below to sign in to ${businessName}.</p>
     <p><a href="${actionLink}" style="color: #0f766e;">Sign in</a></p>
     <p style="font-size: 12px; color: #5b6b68;">If you didn't request this, you can safely ignore this email.</p>`
  );
  await sendEmail(email, `Sign in to ${businessName}`, html, { name: businessName, replyTo });
}

// Carries a real one click sign in link, so the invite itself signs them
// in instead of sending them to a login page to request a second email.
// That link is single use and expires (Supabase's OTP expiry), and a new
// staff member may not open the invite for days, so the login page is
// included as a fallback. Throws on failure so the caller can tell the
// admin the invite didn't go out.
export async function sendStaffInviteEmail(
  businessName: string,
  email: string,
  name: string | null,
  role: "cleaner" | "admin",
  signInLink: string,
  loginUrl: string,
  replyTo?: string | null
): Promise<void> {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const roleLine =
    role === "cleaner"
      ? `You've been added as a cleaner at ${businessName}. Set a password to see your schedule, bookings and invoices.`
      : `You've been invited to help manage ${businessName}.`;
  const html = emailShell(
    businessName,
    `<p>${greeting}</p>
     <p>${roleLine}</p>
     <p><a href="${signInLink}" style="display: inline-block; background: #0f766e; color: #ffffff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600;">Set your password</a></p>
     <p style="font-size: 12px; color: #5b6b68;">This button works once and expires after a while. Once your password is set, sign in at <a href="${loginUrl}" style="color: #0f766e;">${loginUrl}</a>. If the button has stopped working, use "Forgot password" on that page with ${email}.</p>`
  );
  await sendEmail(email, `You've been added to ${businessName}`, html, { name: businessName, replyTo });
}

function emailShell(businessName: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #111827;">
      <h1 style="font-size: 18px; margin-bottom: 16px;">${businessName}</h1>
      ${bodyHtml}
    </div>
  `;
}

async function logNotification(
  bookingId: string,
  channel: "email" | "sms",
  type: "confirmation" | "reminder" | "cancellation" | "payment_receipt",
  outcome: { ok: true; providerId?: string } | { ok: false; error: string }
) {
  const service = createServiceClient();
  const { data: booking } = await service
    .from("PS_CLEAN_bookings")
    .select("business_id")
    .eq("id", bookingId)
    .maybeSingle();
  await service.from("PS_CLEAN_notifications_log").insert({
    business_id: booking?.business_id,
    booking_id: bookingId,
    channel,
    type,
    status: outcome.ok ? "sent" : "failed",
    provider_message_id: outcome.ok ? (outcome.providerId ?? null) : null,
    error: outcome.ok ? null : outcome.error,
    sent_at: outcome.ok ? new Date().toISOString() : null,
  });
}

// Best-effort on both channels: the booking itself already succeeded by the
// time this runs, so a failed confirmation email/text must never undo it —
// each channel's outcome is logged to PS_CLEAN_notifications_log instead so
// a missed notification is visible to the admin panel rather than silent.
export async function sendBookingConfirmation(ctx: NotifyBookingContext): Promise<void> {
  const dateLine = `${formatDate(ctx.startsAt)} at ${formatTime(ctx.startsAt)}`;
  const paymentLine = ctx.quotePending
    ? ctx.pricePence <= 0
      ? "This appointment is free. You'll be given a quote at the end of the walkthrough."
      : "We will check the details and email you a quote."
    : "There is nothing to pay now. We will send you an invoice once your clean is complete.";
  const referenceBlock = ctx.reference
    ? `<p style="margin: 20px 0; padding: 14px 16px; background: #f4f1f2; border-radius: 10px;">Your booking reference is<br /><strong style="font-size: 22px; letter-spacing: 3px;">${ctx.reference}</strong></p>
       <p>Keep this email. To change the date or time, ${
         ctx.amendUrl ? `go to <a href="${ctx.amendUrl}" style="color: #0f766e;">Amend existing booking</a>` : "use Amend existing booking on our website"
       } and enter your reference.</p>`
    : "";

  if (ctx.customerEmail) {
    try {
      const html = emailShell(
        ctx.businessName,
        `<p>Thank you${ctx.customerName ? `, ${escapeHtml(ctx.customerName)}` : ""}. Your ${ctx.serviceName} is booked for <strong>${dateLine}</strong> at ${escapeHtml(ctx.addressLine)}, with ${ctx.cleanerName}.</p>
         <p>${paymentLine}</p>
         ${referenceBlock}`
      );
      const result = await sendEmail(
        ctx.customerEmail,
        ctx.reference ? `Booking confirmed, reference ${ctx.reference}` : `Booking confirmed, ${dateLine}`,
        html,
        { name: ctx.businessName, replyTo: ctx.replyTo }
      );
      await logNotification(ctx.bookingId, "email", "confirmation", { ok: true, providerId: result.id });
    } catch (err) {
      await logNotification(ctx.bookingId, "email", "confirmation", { ok: false, error: String(err) });
    }
  }

  if (ctx.customerPhone) {
    try {
      const body = `${ctx.businessName}: your ${ctx.serviceName} is booked for ${dateLine}.${
        ctx.reference ? ` Your booking reference is ${ctx.reference}.` : ""
      } Reply STOP to opt out of texts.`;
      const result = await sendSms(ctx.customerPhone, body);
      await logNotification(ctx.bookingId, "sms", "confirmation", { ok: true, providerId: result.sid });
    } catch (err) {
      await logNotification(ctx.bookingId, "sms", "confirmation", { ok: false, error: String(err) });
    }
  }
}

export async function sendBookingReminder(ctx: NotifyBookingContext): Promise<void> {
  const dateLine = `${formatDate(ctx.startsAt)} at ${formatTime(ctx.startsAt)}`;

  if (ctx.customerEmail) {
    try {
      const html = emailShell(
        ctx.businessName,
        `<p>Reminder: your ${ctx.serviceName} with ${ctx.cleanerName} is coming up on <strong>${dateLine}</strong> at ${ctx.addressLine}.</p>`
      );
      const result = await sendEmail(ctx.customerEmail, `Reminder: your clean is on ${dateLine}`, html, {
        name: ctx.businessName,
        replyTo: ctx.replyTo,
      });
      await logNotification(ctx.bookingId, "email", "reminder", { ok: true, providerId: result.id });
    } catch (err) {
      await logNotification(ctx.bookingId, "email", "reminder", { ok: false, error: String(err) });
    }
  }

  if (ctx.customerPhone) {
    try {
      const body = `${ctx.businessName}: reminder — your ${ctx.serviceName} is tomorrow, ${dateLine}, at ${ctx.addressLine}.`;
      const result = await sendSms(ctx.customerPhone, body);
      await logNotification(ctx.bookingId, "sms", "reminder", { ok: true, providerId: result.sid });
    } catch (err) {
      await logNotification(ctx.bookingId, "sms", "reminder", { ok: false, error: String(err) });
    }
  }
}

// A slot opening up isn't tied to one of THIS customer's own bookings (it's
// someone else's cancellation), so this doesn't use NotifyBookingContext or
// log against PS_CLEAN_notifications_log the way the booking-lifecycle
// emails above do — best-effort, fire-and-forget, no per-send audit trail
// needed for what's ultimately just a "you might want to look at this" ping.
export async function sendWaitlistOpeningEmail(
  businessName: string,
  email: string,
  serviceName: string,
  dateLabel: string,
  bookingUrl: string,
  replyTo?: string | null
): Promise<void> {
  try {
    const html = emailShell(
      businessName,
      `<p>A slot just opened up for <strong>${serviceName}</strong> on <strong>${dateLabel}</strong> — you asked to be notified.</p>
       <p><a href="${bookingUrl}" style="color: #0f766e;">Book it before it's gone</a></p>`
    );
    await sendEmail(email, `A slot opened up for ${serviceName} on ${dateLabel}`, html, { name: businessName, replyTo });
  } catch {
    // Best-effort — see the file-level pattern used throughout this module.
  }
}

export async function sendCancellationNotice(ctx: NotifyBookingContext): Promise<void> {
  const dateLine = `${formatDate(ctx.startsAt)} at ${formatTime(ctx.startsAt)}`;

  if (ctx.customerEmail) {
    try {
      const html = emailShell(
        ctx.businessName,
        `<p>Your ${ctx.serviceName} on <strong>${dateLine}</strong> has been cancelled.</p>`
      );
      const result = await sendEmail(ctx.customerEmail, `Booking cancelled — ${dateLine}`, html, {
        name: ctx.businessName,
        replyTo: ctx.replyTo,
      });
      await logNotification(ctx.bookingId, "email", "cancellation", { ok: true, providerId: result.id });
    } catch (err) {
      await logNotification(ctx.bookingId, "email", "cancellation", { ok: false, error: String(err) });
    }
  }
}

// A booking has come in for a service priced by quote (the walkthrough):
// tells the owner to quote it after the visit. Best-effort.
export async function sendQuoteRequestToOwner(
  businessName: string,
  ownerEmail: string,
  serviceName: string,
  dateLine: string,
  customerName: string | null,
  adminUrl: string
): Promise<void> {
  try {
    const html = emailShell(
      businessName,
      `<p>${customerName ?? "A customer"} has booked <strong>${serviceName}</strong> for ${dateLine}.</p>
       <p>Open the booking to see their address, a map and the size of the home. After the visit, add the service required, hours and price on the bookings list and press Generate quote to email it to them.</p>
       <p><a href="${adminUrl}" style="color: #0f766e;">View the booking</a></p>`
    );
    await sendEmail(ownerEmail, `New booking: ${serviceName}, ${dateLine}`, html, { name: businessName });
  } catch {
    // Best-effort, see above.
  }
}

// Customer typed text can end up in these emails (names, addresses), so it is
// escaped before going into the HTML.
export function escapeHtml(value: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (c) => map[c]);
}

// A short note to the owner (job finished, job overrunning, booking moved).
// Best-effort: the bookings list shows the same information.
export async function sendOwnerAlert(
  businessName: string,
  to: string[],
  subject: string,
  lines: string[],
  link?: { url: string; label: string }
): Promise<void> {
  if (to.length === 0) return;
  const html = emailShell(
    businessName,
    `${lines.map((l) => `<p>${l}</p>`).join("")}
     ${link ? `<p><a href="${link.url}" style="color: #0f766e;">${link.label}</a></p>` : ""}`
  );
  for (const email of to) {
    try {
      await sendEmail(email, subject, html, { name: businessName });
    } catch {
      // Best-effort, see above.
    }
  }
}

// The customer moved their booking with their reference. Tells them, their
// cleaner and the owner.
export async function sendBookingMovedEmails(ctx: {
  businessName: string;
  serviceName: string;
  reference: string;
  oldDateLine: string;
  newDateLine: string;
  customerEmail: string | null;
  cleanerEmail: string | null;
  ownerEmails: string[];
  adminUrl: string;
  replyTo?: string | null;
}): Promise<void> {
  if (ctx.customerEmail) {
    try {
      const html = emailShell(
        ctx.businessName,
        `<p>Your ${ctx.serviceName} has moved to <strong>${ctx.newDateLine}</strong>.</p>
         <p>Your booking reference is still <strong>${ctx.reference}</strong>.</p>`
      );
      await sendEmail(ctx.customerEmail, `Booking moved to ${ctx.newDateLine}`, html, {
        name: ctx.businessName,
        replyTo: ctx.replyTo,
      });
    } catch {
      // Best-effort.
    }
  }
  if (ctx.cleanerEmail) {
    try {
      const html = emailShell(
        ctx.businessName,
        `<p>A ${ctx.serviceName} you are booked on has moved from ${ctx.oldDateLine} to <strong>${ctx.newDateLine}</strong>.</p>`
      );
      await sendEmail(ctx.cleanerEmail, `Job moved to ${ctx.newDateLine}`, html, { name: ctx.businessName });
    } catch {
      // Best-effort.
    }
  }
  await sendOwnerAlert(
    ctx.businessName,
    ctx.ownerEmails,
    `Booking ${ctx.reference} moved to ${ctx.newDateLine}`,
    [`The customer moved their ${ctx.serviceName} (reference ${ctx.reference}) from ${ctx.oldDateLine} to <strong>${ctx.newDateLine}</strong>.`],
    { url: ctx.adminUrl, label: "View the booking" }
  );
}

export interface QuoteOrInvoiceEmail {
  businessName: string;
  customerEmail: string;
  customerName: string | null;
  reference: string;
  serviceName: string;
  dateLine: string;
  addressLine: string;
  hours: number | null;
  paymentFormat: "set_price" | "hourly" | null;
  hourlyRatePence: number | null;
  amountPence: number;
  replyTo?: string | null;
  contactPhone?: string | null;
}

function priceTable(e: QuoteOrInvoiceEmail, totalLabel: string): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding: 6px 0; color: #5b6b68;">${label}</td><td style="padding: 6px 0; text-align: right;">${value}</td></tr>`;
  const payment =
    e.paymentFormat === "hourly"
      ? `Hourly${e.hourlyRatePence ? `, ${formatPence(e.hourlyRatePence)} per hour` : ""}`
      : e.paymentFormat === "set_price"
        ? "Set price"
        : null;
  return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
    ${row("Reference", e.reference)}
    ${row("Service", escapeHtml(e.serviceName))}
    ${row("Date", e.dateLine)}
    ${row("Address", escapeHtml(e.addressLine))}
    ${e.hours ? row("Hours", String(e.hours)) : ""}
    ${payment ? row("Payment", payment) : ""}
    <tr><td style="padding: 10px 0; border-top: 1px solid #e5e7eb; font-weight: 600;">${totalLabel}</td><td style="padding: 10px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${formatPence(e.amountPence)}</td></tr>
  </table>`;
}

// The owner's estimate, emailed from the bookings list. Throws so the owner
// is told if it didn't go.
export async function sendQuoteEmail(e: QuoteOrInvoiceEmail): Promise<void> {
  const html = emailShell(
    e.businessName,
    `<p>${e.customerName ? `Hi ${escapeHtml(e.customerName)},` : "Hi,"}</p>
     <p>Thank you for having us round. Here is your quote.</p>
     ${priceTable(e, e.paymentFormat === "hourly" ? "Estimated total" : "Quoted price")}
     ${e.paymentFormat === "hourly" ? `<p style="font-size: 13px; color: #5b6b68;">Charged by the hour, so the final amount depends on the time the clean takes.</p>` : ""}
     <p>Just reply to this email${e.contactPhone ? ` or call us on ${escapeHtml(e.contactPhone)}` : ""} to go ahead or ask a question.</p>`
  );
  await sendEmail(e.customerEmail, `Your quote from ${e.businessName}`, html, { name: e.businessName, replyTo: e.replyTo });
}

// The invoice once the job is done. The invoice number is the booking
// reference, so it is unique and the customer already knows it.
export async function sendInvoiceEmail(e: QuoteOrInvoiceEmail): Promise<void> {
  const html = emailShell(
    e.businessName,
    `<p>${e.customerName ? `Hi ${escapeHtml(e.customerName)},` : "Hi,"}</p>
     <p>Thank you for choosing us. Here is your invoice for your clean.</p>
     ${priceTable(e, "Amount due")}
     <p>Invoice number ${e.reference}. Please quote it with your payment. Reply to this email${
       e.contactPhone ? ` or call us on ${escapeHtml(e.contactPhone)}` : ""
     } with any questions.</p>`
  );
  await sendEmail(e.customerEmail, `Invoice ${e.reference} from ${e.businessName}`, html, {
    name: e.businessName,
    replyTo: e.replyTo,
  });
}
