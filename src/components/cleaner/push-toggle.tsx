"use client";

import { useEffect, useState } from "react";
import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/lib/actions/push";

type State = "checking" | "unsupported" | "blocked" | "off" | "on";

// The browser wants the public key as bytes, not the base64url text we store.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// Lets a cleaner turn on notifications for new bookings on this device. On an
// iPhone this only works once the app has been added to the Home Screen.
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setState(existing && Notification.permission === "granted" ? "on" : "off");
    }
    check().catch(() => {
      if (!cancelled) setState("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const json = subscription.toJSON();
      const result = await savePushSubscriptionAction({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn on notifications");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn off notifications");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-3 text-sm">
      {state === "unsupported" && (
        <p className="text-muted-foreground">
          To get job notifications, add this app to your Home Screen first (Share, then Add to Home Screen), then open it from there.
        </p>
      )}
      {state === "blocked" && (
        <p className="text-muted-foreground">
          Notifications are blocked for this app. Turn them back on in your phone&apos;s settings, then come back here.
        </p>
      )}
      {state === "off" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-foreground">Get a notification when a new booking is made for you.</p>
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-60"
          >
            {busy ? "Turning on…" : "Turn on"}
          </button>
        </div>
      )}
      {state === "on" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-foreground">Job notifications are on for this device.</p>
          <button
            type="button"
            onClick={turnOff}
            disabled={busy}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground disabled:opacity-60"
          >
            Turn off
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
