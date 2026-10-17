"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveRequestAction,
  checkSiteLiveAction,
  emailOwnerLinkAction,
  provisionAction,
  reopenRequestAction,
  resendWelcomeAction,
  setPaymentModeAction,
} from "@/lib/actions/platform";
import type { PaymentMode } from "@/lib/stripe-connect";
import type { LogEntry, OnboardingStatus } from "@/lib/onboarding";

const STEP_LABEL: Record<string, string> = {
  business: "Business and branding created",
  owner: "Owner invited",
  services: "Services added",
  team: "Team added",
  hours: "Working hours set",
  payments: "Card payments arranged",
  welcome: "Welcome email sent",
  live: "Site answering on its address",
};
const STEP_ORDER = ["business", "owner", "services", "team", "hours", "payments", "welcome", "live"];

const MODE_OPTIONS: { value: PaymentMode; label: string; hint: string }[] = [
  { value: "platform", label: "Platform Stripe account", hint: "Paid to you, passed on to the owner by you" },
  { value: "connect", label: "Owner's own Stripe account", hint: "Paid straight to them, no fee taken" },
];

const buttonClass = "rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground disabled:opacity-60";

export function OwnerLinkCard({ id, link, canEmail }: { id: string; link: string; canEmail: boolean }) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">Owner&apos;s link</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground" />
        <button
          type="button"
          className={buttonClass}
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        {canEmail && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass}
            onClick={() =>
              startTransition(async () => {
                const r = await emailOwnerLinkAction(id);
                setMessage(r.ok ? "Emailed." : (r.error ?? "Couldn't send."));
              })
            }
          >
            {pending ? "Sending…" : "Email it"}
          </button>
        )}
      </div>
      {message && <p role="status" className="mt-2 text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

export function SetupPanel({
  id,
  status,
  log,
  missing,
  suggestedMode,
  currentMode,
  chargesEnabled,
}: {
  id: string;
  status: OnboardingStatus;
  log: LogEntry[];
  missing: string[];
  suggestedMode: PaymentMode;
  currentMode: PaymentMode | null;
  chargesEnabled: boolean;
}) {
  const router = useRouter();
  const [sendWelcome, setSendWelcome] = useState(true);
  const [mode, setMode] = useState<PaymentMode>(suggestedMode);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<void>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const ordered = STEP_ORDER.map((step) => log.find((e) => e.step === step)).filter((e): e is LogEntry => Boolean(e));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">Set up</p>

      {status === "submitted" && (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">
            Creates the business, branding, owner invite, services, team and hours from the answers below, then emails the owner how to sign in.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Email the owner when it&apos;s done
          </label>
          <fieldset className="mt-3">
            <legend className="text-sm font-medium text-foreground">Where do card payments go?</legend>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {MODE_OPTIONS.map((o) => (
                <label key={o.value} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${mode === o.value ? "border-brand bg-brand/5" : "border-border"}`}>
                  <input type="radio" name="payment-mode" className="sr-only" checked={mode === o.value} onChange={() => setMode(o.value)} />
                  <span className="block font-medium text-foreground">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await provisionAction(id, sendWelcome, mode);
                  if (!r.ok) setError(r.error ?? "Something went wrong.");
                })
              }
              className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
            >
              {pending ? "Setting up…" : log.some((e) => !e.ok) ? "Try again" : "Set up this business"}
            </button>
            <button type="button" disabled={pending} className="text-sm text-muted-foreground underline" onClick={() => run(async () => { await reopenRequestAction(id); })}>
              Send back to the owner to edit
            </button>
          </div>
        </div>
      )}

      {status === "in_progress" && (
        <p className="mt-2 text-sm text-muted-foreground">
          Waiting on the owner{missing.length > 0 ? `. Still to do: ${missing.join(", ")}.` : ", they haven't pressed send yet."}
        </p>
      )}
      {status === "invited" && <p className="mt-2 text-sm text-muted-foreground">The owner hasn&apos;t opened their link yet.</p>}

      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

      {ordered.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {ordered.map((e) => (
            <li key={e.step} className="flex items-start gap-2 text-sm">
              <span aria-hidden="true" className={e.ok ? "text-success" : "text-danger"}>{e.ok ? "✓" : "✕"}</span>
              <span>
                <span className="text-foreground">{STEP_LABEL[e.step] ?? e.step}</span>
                <span className="block text-xs text-muted-foreground">{e.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {status === "provisioned" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <button type="button" disabled={pending} className={buttonClass} onClick={() => run(async () => { const r = await checkSiteLiveAction(id); setMessage(r.detail); })}>
            Check the site is live
          </button>
          <button type="button" disabled={pending} className={buttonClass} onClick={() => run(async () => { const r = await resendWelcomeAction(id); setMessage(r.ok ? "Welcome email sent." : (r.error ?? "Couldn't send.")); })}>
            Resend welcome email
          </button>
          {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        </div>
      )}

      {status === "provisioned" && currentMode && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            Card payments: {currentMode === "connect" ? (chargesEnabled ? "owner's own Stripe account, ready" : "owner's own Stripe account, owner still to finish setup") : "platform Stripe account"}
          </span>
          <button
            type="button"
            disabled={pending}
            className="text-muted-foreground underline"
            onClick={() =>
              run(async () => {
                const r = await setPaymentModeAction(id, currentMode === "connect" ? "platform" : "connect");
                setMessage(r.ok ? "Switched." : (r.error ?? "Couldn't switch."));
              })
            }
          >
            Switch to {currentMode === "connect" ? "platform account" : "owner's own account"}
          </button>
        </div>
      )}

      {status !== "provisioned" && status !== "archived" && (
        <div className="mt-4 border-t border-border pt-3">
          <button type="button" disabled={pending} className="text-sm text-muted-foreground underline" onClick={() => { if (confirm("Archive this request? The owner's link will stop working.")) run(async () => { await archiveRequestAction(id); }); }}>
            Archive this request
          </button>
        </div>
      )}
    </div>
  );
}
