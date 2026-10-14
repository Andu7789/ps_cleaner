"use client";

import { useState, useTransition } from "react";
import { approveQuoteAction } from "@/lib/actions/quotes";

// Owner control to confirm or adjust the price of a booking that needs a
// quote. Confirming tells the cleaner and the customer.
export function QuoteForm({
  bookingId,
  estimatePence,
  quoted,
}: {
  bookingId: string;
  estimatePence: number;
  quoted: boolean;
}) {
  const [price, setPrice] = useState((estimatePence / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await approveQuoteAction(bookingId, Number(price));
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the price");
      }
    });
  }

  return (
    <form onSubmit={submit} className="mt-1">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">£</span>
        <input
          type="number"
          min={0}
          step={0.01}
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          aria-label="Final price in pounds"
          className="w-24 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground"
        />
        <button
          type="submit"
          disabled={pending || price === ""}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : quoted ? "Update price" : "Approve price"}
        </button>
      </div>
      {saved && <p className="mt-1 text-xs text-success">Confirmed. The cleaner and customer have been emailed.</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </form>
  );
}
