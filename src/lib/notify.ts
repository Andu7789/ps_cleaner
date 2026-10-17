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
      ? "You'll be given a quote at the end of the walkthrough."
      : "We will check the details and be in touch with your exact price. Nothing has been taken yet."
    : `The full amount of ${formatPence(ctx.pricePence)} has been taken.`;

  if (ctx.customerEmail) {
    try {
      const html = emailShell(
        ctx.businessName,
        ctx.quotePending
          ? `<p>Thank you for booking your ${ctx.serviceName} for <strong>${dateLine}</strong> at ${ctx.addressLine}, with ${ctx.cleanerName}. Your slot is held.</p>
         <p>${paymentLine}</p>`
          : `<p>Your ${ctx.serviceName} is confirmed for <strong>${dateLine}</strong> at ${ctx.addressLine}, with ${ctx.cleanerName}.</p>
         <p>${paymentLine}</p>`
      );
      const result = await sendEmail(
        ctx.customerEmail,
        ctx.quotePending && ctx.pricePence > 0
          ? `Booking received, price to follow — ${dateLine}`
          : ctx.quotePending
            ? `Booking received — ${dateLine}`
            : `Booking confirmed — ${dateLine}`,
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
      const body = ctx.quotePending
        ? `${ctx.businessName}: we have received your ${ctx.serviceName} booking for ${dateLine} ${ctx.pricePence <= 0 ? "and you'll be given a quote at the end of the walkthrough." : "and will be in touch with your exact price."} Reply STOP to opt out of texts.`
        : `${ctx.businessName}: your ${ctx.serviceName} is confirmed for ${dateLine} at ${ctx.addressLine}. Reply STOP to opt out of texts.`;
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

// A booking has come in for a service priced by quote: tells the owner to
// confirm the price. Best-effort, the bookings list also flags it.
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
       <p>Open the booking to see their address, a map and the size of the home. This service needs an exact quote, so once the visit is done please confirm the price and the customer and cleaner will be told.</p>
       <p><a href="${adminUrl}" style="color: #0f766e;">View the booking</a></p>`
    );
    await sendEmail(ownerEmail, `New booking: ${serviceName}, ${dateLine}`, html, { name: businessName });
  } catch {
    // Best-effort, see above.
  }
}

// The owner has confirmed the price: the cleaner gets it and the customer is
// told what they will pay.
export async function sendQuoteApprovedEmails(ctx: {
  businessName: string;
  serviceName: string;
  dateLine: string;
  pricePence: number;
  cleanerEmail: string | null;
  customerEmail: string | null;
  replyTo?: string | null;
  // Set when the customer still has something to pay up front.
  payNow?: { amountPence: number; url: string };
}): Promise<void> {
  if (ctx.cleanerEmail) {
    try {
      const html = emailShell(
        ctx.businessName,
        `<p>The price for the ${ctx.serviceName} on <strong>${ctx.dateLine}</strong> has been confirmed at <strong>${formatPence(ctx.pricePence)}</strong>.</p>`
      );
      await sendEmail(ctx.cleanerEmail, `Price confirmed: ${formatPence(ctx.pricePence)}`, html, {
        name: ctx.businessName,
        replyTo: ctx.replyTo,
      });
    } catch {
      // Best-effort.
    }
  }
  if (ctx.customerEmail) {
    try {
      const html = emailShell(
        ctx.businessName,
        `<p>The price for your ${ctx.serviceName} on <strong>${ctx.dateLine}</strong> is confirmed at <strong>${formatPence(ctx.pricePence)}</strong>.</p>
         ${
           ctx.payNow
             ? `<p>To secure it, please pay <strong>${formatPence(ctx.payNow.amountPence)}</strong>: <a href="${ctx.payNow.url}">pay now</a>.</p>`
             : ""
         }`
      );
      await sendEmail(ctx.customerEmail, `Your quote: ${formatPence(ctx.pricePence)}`, html, {
        name: ctx.businessName,
        replyTo: ctx.replyTo,
      });
    } catch {
      // Best-effort.
    }
  }
}
