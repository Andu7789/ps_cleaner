"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOnboardingRequestAction } from "@/lib/actions/platform";

const inputClass =
  "mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70";

export function NewRequestForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; link: string; note: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createOnboardingRequestAction({ businessName, ownerName, ownerEmail, sendEmail });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated({
        id: result.id,
        link: result.link,
        note: result.emailed
          ? `Emailed to ${ownerEmail}.`
          : result.emailError
            ? `Couldn't email it (${result.emailError}). Copy the link and send it yourself.`
            : "Copy the link and send it to them.",
      });
      router.refresh();
    });
  }

  function reset() {
    setCreated(null);
    setOpen(false);
    setBusinessName("");
    setOwnerName("");
    setOwnerEmail("");
    setCopied(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
        New business
      </button>
    );
  }

  if (created) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Ready to send. {created.note}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} mt-0 flex-1 font-mono text-xs`} />
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(created.link);
              setCopied(true);
            }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          <a href={`/platform/${created.id}`} className="font-medium text-brand underline">Open request</a>
          <button type="button" onClick={reset} className="text-muted-foreground underline">Add another</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">Who are we setting up?</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-foreground">
          Business name
          <input required className={inputClass} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-foreground">
          Owner&apos;s name
          <input className={inputClass} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-foreground">
          Owner&apos;s email
          <input type="email" className={inputClass} value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
        Email them the link now
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60">
          {pending ? "Creating…" : "Create link"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground underline">Cancel</button>
      </div>
    </form>
  );
}
