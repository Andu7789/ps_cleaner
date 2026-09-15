"use client";

import { useState, useTransition } from "react";
import { setCleanerQualificationAction } from "@/lib/actions/admin";

export function QualificationCard({
  cleanerId,
  serviceId,
  serviceName,
  initiallyQualified,
}: {
  cleanerId: string;
  serviceId: string;
  serviceName: string;
  initiallyQualified: boolean;
}) {
  const [qualified, setQualified] = useState(initiallyQualified);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={qualified}
      onClick={() => {
        const next = !qualified;
        setQualified(next);
        startTransition(async () => {
          try {
            await setCleanerQualificationAction(cleanerId, serviceId, next);
          } catch {
            setQualified(!next);
          }
        });
      }}
      className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-medium transition disabled:opacity-60 ${
        qualified
          ? "border-brand bg-brand/5 text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-brand/50"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          qualified ? "border-brand bg-brand text-brand-foreground" : "border-border"
        }`}
      >
        {qualified && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path
              fillRule="evenodd"
              d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.415 0l-3.5-3.5a1 1 0 111.415-1.42L8.5 12.085l6.79-6.795a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </span>
      {serviceName}
    </button>
  );
}
