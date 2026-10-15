"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

export function WeekPicker({ label, value }: { label: string; value: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => {
          const input = inputRef.current;
          if (!input) return;
          if (typeof input.showPicker === "function") input.showPicker();
          else input.click();
        }}
        className="rounded-full border border-border bg-card px-3 py-1 font-medium text-foreground transition hover:border-brand hover:text-brand"
        aria-label={`${label}. Choose a different week`}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.value) router.push(`/cleaner/schedule?week=${e.target.value}`);
        }}
        className="pointer-events-none absolute left-0 top-full h-0 w-0 opacity-0"
      />
    </span>
  );
}
