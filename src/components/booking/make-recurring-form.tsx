"use client";

import { useState, useTransition } from "react";
import { makeRecurringAction } from "@/lib/actions/recurring";
import type { RecurringFrequency } from "@/lib/types";

export function MakeRecurringForm({ bookingId }: { bookingId: string }) {
  const [frequency, setFrequency] = useState<RecurringFrequency>("weekly");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return <p className="text-sm text-success">Set up — we&apos;ll automatically book your next visits.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={frequency}
        onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
      >
        <option value="weekly">Every week</option>
        <option value="fortnightly">Every 2 weeks</option>
        <option value="monthly">Every month</option>
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await makeRecurringAction(bookingId, frequency);
              setDone(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't set up a recurring booking");
            }
          })
        }
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-brand hover:border-brand disabled:opacity-60"
      >
        {pending ? "Setting up…" : "Make this a regular booking"}
      </button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}
