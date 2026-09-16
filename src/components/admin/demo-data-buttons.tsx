"use client";

import { useState, useTransition } from "react";
import { clearInvoiceDemoDataAction, seedInvoiceDemoDataAction } from "@/lib/actions/demo-data";

export function DemoDataButtons() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSeed() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const { created, skipped } = await seedInvoiceDemoDataAction();
        setMessage(
          `Added ${created} completed job${created === 1 ? "" : "s"}${skipped > 0 ? ` (skipped ${skipped})` : ""} — head to Admin → Invoices to generate one.`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add demo data");
      }
    });
  }

  function handleClear() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const count = await clearInvoiceDemoDataAction();
        setMessage(`Removed ${count} demo job${count === 1 ? "" : "s"}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't clear demo data");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold text-foreground">Invoice feature demo data</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Adds one completed job per active cleaner over the last ~10 days, using a dedicated demo customer — enough
        to generate a real invoice from at <span className="font-medium text-foreground">Admin → Invoices</span>.
        Doesn&apos;t touch anything else.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={handleSeed}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Working…" : "Add demo data"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleClear}
          className="rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
        >
          Clear demo data
        </button>
      </div>
      {message && <p className="mt-2 text-sm text-success">{message}</p>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
