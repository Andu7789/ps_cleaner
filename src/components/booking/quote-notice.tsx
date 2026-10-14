"use client";

import { useEffect, useRef } from "react";

// Shown as soon as checkout opens for a service that is priced by quote, so
// nobody books believing the listed price is final.
export function QuoteNotice({ businessName }: { businessName: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="quote-notice-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <h2 id="quote-notice-title" className="text-lg font-semibold">
        We&apos;ll confirm your exact price
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {businessName} will be in contact to give you an exact quote for this service. The price shown is an estimate
        until then, and you won&apos;t be charged the full amount before you&apos;ve agreed it.
      </p>
      <button
        type="button"
        onClick={() => ref.current?.close()}
        autoFocus
        className="mt-5 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
      >
        Got it, continue
      </button>
    </dialog>
  );
}
