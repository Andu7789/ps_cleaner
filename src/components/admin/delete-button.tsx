"use client";

import { useState, useTransition } from "react";

// Two step delete: first click asks, second click does it. Shows the reason
// when the server refuses, for example because the item has bookings.
export function DeleteButton({
  name,
  onDelete,
}: {
  name: string;
  onDelete: () => Promise<{ error: string } | undefined>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await onDelete();
      if (result?.error) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          aria-label={`Delete ${name}`}
          className="rounded-lg border border-danger px-2 py-1 text-xs font-medium text-danger"
        >
          Delete
        </button>
        {error && (
          <p role="alert" className="max-w-56 text-right text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <p className="text-xs text-foreground">Delete {name} for good?</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={confirmDelete}
          className="rounded-lg bg-danger px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
