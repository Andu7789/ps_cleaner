import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushPayload {
  title: string;
  body: string;
  // Where tapping the notification opens inside the app.
  url: string;
}

let configured = false;

// Push is optional: without the VAPID keys in the environment every send is a
// quiet no-op, so bookings never fail because notifications aren't set up.
function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

// Sends to every device a cleaner has turned notifications on for. Best effort:
// dead subscriptions (the cleaner removed the app or revoked permission) are
// cleaned up, and any other failure is logged and swallowed.
export async function sendPushToCleaner(
  service: SupabaseClient,
  cleanerId: string,
  payload: PushPayload
): Promise<void> {
  if (!configure()) return;
  try {
    const { data: subs } = await service
      .from("PS_CLEAN_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("cleaner_id", cleanerId);
    await Promise.all(
      (subs ?? []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload)
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await service.from("PS_CLEAN_push_subscriptions").delete().eq("id", sub.id);
          } else {
            console.error("Push send failed", err);
          }
        }
      })
    );
  } catch (err) {
    console.error("Push send failed", err);
  }
}
