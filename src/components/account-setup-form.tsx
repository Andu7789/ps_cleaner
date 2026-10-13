"use client";

import { useState } from "react";
import { createCustomerProfileAction } from "@/lib/actions/customer";

const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand";

export function AccountSetupForm({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const result = await createCustomerProfileAction(
        String(formData.get("fullName") ?? ""),
        String(formData.get("phone") ?? ""),
        next
      );
      if (result?.error) {
        setError(result.error);
        setPending(false);
      }
    } catch {
      setError("Something went wrong, please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-3">
      <input name="fullName" required placeholder="Full name" className={inputClass} />
      <input name="phone" required type="tel" placeholder="Phone number" className={inputClass} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
