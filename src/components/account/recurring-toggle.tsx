"use client";

import { useTransition } from "react";
import { pauseRecurringAction } from "@/lib/actions/recurring";

export function RecurringToggle({ recurringId, isActive }: { recurringId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => pauseRecurringAction(recurringId, !isActive))}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-brand hover:text-brand disabled:opacity-60"
    >
      {isActive ? "Pause" : "Resume"}
    </button>
  );
}
