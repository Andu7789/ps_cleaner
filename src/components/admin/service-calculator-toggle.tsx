"use client";

import { useState, useTransition } from "react";
import { setServiceCalculatorAction } from "@/lib/actions/admin";

export function ServiceCalculatorToggle({ serviceId, initialEnabled }: { serviceId: string; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        className="accent-brand"
        checked={enabled}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setEnabled(next);
          startTransition(() => setServiceCalculatorAction(serviceId, next));
        }}
      />
      Use pricing calculator
    </label>
  );
}
