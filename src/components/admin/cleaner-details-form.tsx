"use client";

import { useState, useTransition } from "react";
import { updateCleanerDetailsAction } from "@/lib/actions/admin";

export function CleanerDetailsForm({
  cleanerId,
  initialFullName,
  initialEmail,
  initialPhone,
  initialBio,
  isLinked,
}: {
  cleanerId: string;
  initialFullName: string;
  initialEmail: string | null;
  initialPhone: string | null;
  initialBio: string | null;
  isLinked: boolean;
}) {
  const [fullName, setFullName] = useState(initialFullName);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateCleanerDetailsAction(cleanerId, { fullName, email, phone, bio });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save changes");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Full name
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Phone
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block text-xs text-muted-foreground">
        Bio
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
      </label>
      {isLinked && (
        <p className="text-xs text-muted-foreground">
          This cleaner has already signed in — changing their email here updates their contact details only, it
          doesn&apos;t change which email they sign in with.
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={handleSave}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-brand hover:border-brand disabled:opacity-60"
      >
        {pending ? "Saving…" : saved ? "Saved!" : "Save details"}
      </button>
    </div>
  );
}
