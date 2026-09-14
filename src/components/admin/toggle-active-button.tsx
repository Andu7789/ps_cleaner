"use client";

import { useTransition } from "react";

export function ToggleActiveButton({
  isActive,
  onToggle,
}: {
  isActive: boolean;
  onToggle: (nextActive: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => onToggle(!isActive))}
      className={`rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-60 ${
        isActive ? "bg-muted text-muted-foreground" : "bg-brand text-brand-foreground"
      }`}
    >
      {isActive ? "Deactivate" : "Activate"}
    </button>
  );
}
