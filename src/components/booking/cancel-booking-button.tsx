"use client";

import { useState, useTransition } from "react";
import { cancelBookingAction } from "@/lib/actions/booking";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await cancelBookingAction(bookingId);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't cancel this booking");
            }
          })
        }
        className="text-sm text-danger hover:underline disabled:opacity-60"
      >
        {pending ? "Cancelling…" : "Cancel booking"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
