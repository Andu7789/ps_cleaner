"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBusinessAction, type DeleteMode } from "@/lib/actions/platform";

export interface DangerCounts {
  bookings: number;
  customers: number;
  payments: number;
}

export function DangerZone({
  id,
  name,
  slug,
  counts,
  isMain,
}: {
  id: string;
  name: string;
  // Null while there is only a request and no business yet.
  slug: string | null;
  counts: DangerCounts | null;
  isMain: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DeleteMode>("everything");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; warnings: string[] } | null>(null);
  const [pending, startTransition] = useTransition();

  const target = slug ?? name;

  if (isMain) {
    return (
      <section className="rounded-xl border border-danger/30 p-4">
        <h2 className="text-base font-semibold text-danger">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">This is the main business and it can&apos;t be deleted from here.</p>
      </section>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await deleteBusinessAction(id, mode, confirmation);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (mode === "everything") {
        router.push("/platform");
        return;
      }
      setDone({
        message: `${result.message ?? "Deleted."} The owner's request is still in your list as ready to set up, so you can set it up again or delete it below.`,
        warnings: result.warnings ?? [],
      });
      setOpen(false);
      setMode("everything");
      setConfirmation("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-danger/30 p-4">
      <h2 className="text-base font-semibold text-danger">Danger zone</h2>
      {done && (
        <div role="status" className="mt-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
          <p className="font-medium">{done.message}</p>
          {done.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {done.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!open ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {slug ? "Permanently delete this business and everything in it." : "Permanently delete this request."}
          </p>
          <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg border border-danger px-4 py-2 text-sm font-semibold text-danger">
            {slug ? "Delete this business" : "Delete this request"}
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="mt-2">
          {slug && (
            <>
              <p className="text-sm text-foreground">
                This permanently deletes <strong>{slug}</strong>
                {counts ? `, including ${counts.bookings} bookings, ${counts.customers} customers and ${counts.payments} payments` : ""}. It also removes their sign in
                accounts, photos and logo. It cannot be undone.
              </p>
              <fieldset className="mt-3 space-y-2">
                <legend className="sr-only">What to delete</legend>
                <label className={`block cursor-pointer rounded-lg border px-3 py-2 text-sm ${mode === "everything" ? "border-danger bg-danger/5" : "border-border"}`}>
                  <input type="radio" name="delete-mode" className="sr-only" checked={mode === "everything"} onChange={() => setMode("everything")} />
                  <span className="block font-medium text-foreground">Delete everything, including the request</span>
                  <span className="block text-xs text-muted-foreground">Nothing is kept.</span>
                </label>
                <label className={`block cursor-pointer rounded-lg border px-3 py-2 text-sm ${mode === "business" ? "border-danger bg-danger/5" : "border-border"}`}>
                  <input type="radio" name="delete-mode" className="sr-only" checked={mode === "business"} onChange={() => setMode("business")} />
                  <span className="block font-medium text-foreground">Delete the business, keep the owner&apos;s answers</span>
                  <span className="block text-xs text-muted-foreground">The request goes back to &quot;ready to set up&quot; so you can set it up again.</span>
                </label>
              </fieldset>
            </>
          )}
          <label className="mt-4 block text-sm font-medium text-foreground">
            Type <span className="font-mono">{target}</span> to confirm
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="mt-1.5 block w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground"
            />
          </label>
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex items-center gap-4">
            <button
              type="submit"
              disabled={pending || confirmation.trim().toLowerCase() !== target.toLowerCase()}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setConfirmation(""); setError(null); }} className="text-sm text-muted-foreground underline">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
