"use client";

import { useState, useTransition } from "react";
import { updateCustomerDetailsAction } from "@/lib/actions/customer";

const inputClass =
  "mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand";

export function CustomerDetailsForm({
  initialFullName,
  initialPhone,
  email,
}: {
  initialFullName: string;
  initialPhone: string;
  email: string;
}) {
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await updateCustomerDetailsAction(fullName, phone);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch {
        setError("Something went wrong, please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-3">
      <label className="block text-xs text-muted-foreground">
        Full name
        <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
      </label>
      <label className="block text-xs text-muted-foreground">
        Phone number
        <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
      </label>
      <label className="block text-xs text-muted-foreground">
        Email
        <input value={email} readOnly disabled className={`${inputClass} opacity-60`} />
      </label>
      <p className="text-xs text-muted-foreground">Your email is what you sign in with, so it can&apos;t be changed here.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Saving…" : saved ? "Saved!" : "Save details"}
      </button>
    </form>
  );
}
