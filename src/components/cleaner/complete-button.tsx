"use client";

import { useState, useTransition } from "react";
import { completeBookingAction } from "@/lib/actions/cleaner";

export function CompleteButton({ bookingId }: { bookingId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await completeBookingAction(bookingId);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't mark this job complete");
            }
          })
        }
        className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Marking complete…" : "Mark job complete"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
