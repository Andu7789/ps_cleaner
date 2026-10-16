"use client";

import { useState, useTransition } from "react";
import { deleteAccountAction } from "@/lib/actions/customer";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction();
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <section className="mt-10 rounded-xl border border-danger/40 bg-card p-5">
      <h2 className="font-semibold text-foreground">Delete my account</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This removes your name, phone number, email, saved addresses, reviews, credit and regular bookings, and closes your
        login. Any upcoming bookings are cancelled. Past bookings are kept for our records but are no longer linked to you.
        It can&apos;t be undone.
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border-2 border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/5"
        >
          Delete my account
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-muted-foreground">
            Type DELETE to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-danger"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmDelete}
              disabled={pending || typed.trim().toUpperCase() !== "DELETE"}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
            >
              Keep my account
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
