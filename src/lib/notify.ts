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
  depositPence: number;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<{ id?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("Email isn't configured (RESEND_API_KEY missing)");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${process.env.NOTIFY_FROM_EMAIL ?? "bookings@example.com"}`,
      to,
      subject,
      html,
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
export async function sendMagicLinkEmail(businessName: string, email: string, actionLink: string): Promise<void> {
  const html = emailShell(
    businessName,
    `<p>Click below to sign in to ${businessName}.</p>
     <p><a href="${actionLink}" style="color: #0f766e;">Sign in</a></p>
     <p style="font-size: 12px; color: #5b6b68;">If you didn't request this, you can safely ignore this email.</p>`
  );
  await sendEmail(email, `Sign in to ${businessName}`, html);
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
  await service.from("PS_CLEAN_notifications_log").insert({
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
  const depositLine =
    ctx.depositPence > 0
      ? `A deposit of ${formatPence(ctx.depositPence)} has been taken; the remaining ${formatPence(
          ctx.pricePence - ctx.depositPence
        )} is due before your clean.`
      : `The full amount of ${formatPence(ctx.pricePence)} has been taken.`;

  if (ctx.customerEmail) {
    try {
      const html = emailShell(
        ctx.businessName,
        `<p>Your ${ctx.serviceName} is confirmed for <strong>${dateLine}</strong> at ${ctx.addressLine}, with ${ctx.cleanerName}.</p>
         <p>${depositLine}</p>`
      );
      const result = await sendEmail(ctx.customerEmail, `Booking confirmed — ${dateLine}`, html);
      await logNotification(ctx.bookingId, "email", "confirmation", { ok: true, providerId: result.id });
    } catch (err) {
      await logNotification(ctx.bookingId, "email", "confirmation", { ok: false, error: String(err) });
    }
  }

  if (ctx.customerPhone) {
    try {
      const body = `${ctx.businessName}: your ${ctx.serviceName} is confirmed for ${dateLine} at ${ctx.addressLine}. Reply STOP to opt out of texts.`;
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
      const result = await sendEmail(ctx.customerEmail, `Reminder: your clean is on ${dateLine}`, html);
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

export async function sendCancellationNotice(ctx: NotifyBookingContext): Promise<void> {
  const dateLine = `${formatDate(ctx.startsAt)} at ${formatTime(ctx.startsAt)}`;

  if (ctx.customerEmail) {
    try {
      const html = emailShell(
        ctx.businessName,
        `<p>Your ${ctx.serviceName} on <strong>${dateLine}</strong> has been cancelled.</p>`
      );
      const result = await sendEmail(ctx.customerEmail, `Booking cancelled — ${dateLine}`, html);
      await logNotification(ctx.bookingId, "email", "cancellation", { ok: true, providerId: result.id });
    } catch (err) {
      await logNotification(ctx.bookingId, "email", "cancellation", { ok: false, error: String(err) });
    }
  }
}
