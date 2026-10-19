"use client";

import { useState, useTransition } from "react";
import { completeBookingAction } from "@/lib/actions/cleaner";

// Locked until the job has a before and an after photo. The server checks
// the same thing, this just says why the button can't be pressed yet.
export function CompleteButton({ bookingId, hasBefore, hasAfter }: { bookingId: string; hasBefore: boolean; hasAfter: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const missing = [!hasBefore && "a before photo", !hasAfter && "an after photo"].filter(Boolean).join(" and ");
  const ready = missing === "";

  return (
    <div>
      <button
        type="button"
        disabled={pending || !ready}
        aria-describedby={ready ? undefined : "complete-blocked"}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const result = await completeBookingAction(bookingId);
              if (result?.error) setError(result.error);
            } catch {
              setError("Couldn't mark this job complete. Please check your signal and try again.");
            }
          })
        }
        className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Marking complete…" : "Mark job complete"}
      </button>
      {!ready && (
        <p id="complete-blocked" className="mt-1.5 text-sm font-medium text-red-700 dark:text-red-400">
          Add {missing} to finish this job.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
