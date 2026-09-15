"use client";

import { useState, useTransition } from "react";
import { reconcilePaymentAction } from "@/lib/actions/admin";

export function SyncPaymentButton({ bookingId }: { bookingId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(null);
            const outcome = await reconcilePaymentAction(bookingId);
            setResult(outcome.message);
          })
        }
        className="text-xs font-medium text-brand hover:underline disabled:opacity-60"
      >
        {pending ? "Checking…" : "Sync with Stripe"}
      </button>
      {result && <p className="mt-1 text-xs text-muted-foreground">{result}</p>}
    </div>
  );
}
