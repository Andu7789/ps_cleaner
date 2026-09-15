"use client";

import { useState, useTransition } from "react";
import { joinWaitlistAction } from "@/lib/actions/waitlist";

export function WaitlistButton({ serviceId, wantedDate }: { serviceId: string; wantedDate: string }) {
  const [pending, startTransition] = useTransition();
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (joined) {
    return <p className="mt-3 text-sm text-success">We&apos;ll email you if a slot opens up.</p>;
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await joinWaitlistAction(serviceId, wantedDate);
              setJoined(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't join the waitlist");
            }
          })
        }
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-brand hover:border-brand disabled:opacity-60"
      >
        {pending ? "Joining…" : "Notify me if a slot opens up"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
