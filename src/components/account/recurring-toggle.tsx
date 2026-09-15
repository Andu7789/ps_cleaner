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
      className="text-xs font-medium text-muted-foreground hover:text-brand hover:underline disabled:opacity-60"
    >
      {isActive ? "Pause" : "Resume"}
    </button>
  );
}
