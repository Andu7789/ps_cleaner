"use client";

import { useState, useTransition } from "react";
import { updateCleanerPayRateAction } from "@/lib/actions/invoices";
import type { PayRateType } from "@/lib/types";

const LABELS: Record<PayRateType, string> = {
  percentage: "% of job price",
  hourly: "£ per hour",
  fixed_per_job: "£ per job",
};

export function PayRateForm({
  cleanerId,
  initialType,
  initialValue,
}: {
  cleanerId: string;
  initialType: PayRateType;
  initialValue: number;
}) {
  const [type, setType] = useState<PayRateType>(initialType);
  // Value is edited in pounds for hourly/fixed_per_job (stored in pence),
  // but as a plain 0-100 number for percentage — matching how the amount
  // is actually meant to be entered by a non-technical admin.
  const [value, setValue] = useState(() => (initialType === "percentage" ? initialValue : initialValue / 100));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    setSaved(false);
    const storedValue = type === "percentage" ? value : Math.round(value * 100);
    startTransition(async () => {
      try {
        await updateCleanerPayRateAction(cleanerId, type, storedValue);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save pay rate");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-muted-foreground">
        Pay type
        <select
          value={type}
          onChange={(e) => {
            const nextType = e.target.value as PayRateType;
            setType(nextType);
            setValue(nextType === "percentage" ? 60 : 15);
          }}
          className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm"
        >
          <option value="percentage">Percentage of job price</option>
          <option value="hourly">Hourly rate</option>
          <option value="fixed_per_job">Fixed per job</option>
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        {LABELS[type]}
        <input
          type="number"
          min={0}
          step={type === "percentage" ? 1 : 0.01}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="mt-1 block w-28 rounded-lg border border-border px-2 py-1.5 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={handleSave}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-brand hover:border-brand disabled:opacity-60"
      >
        {pending ? "Saving…" : saved ? "Saved!" : "Save pay rate"}
      </button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}
