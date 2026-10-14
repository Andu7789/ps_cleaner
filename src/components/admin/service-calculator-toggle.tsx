"use client";

import { useState, useTransition } from "react";
import {
  setServiceCalculatorAction,
  setServiceRequiresQuoteAction,
  setServiceRoomsNoChargeAction,
} from "@/lib/actions/admin";

export function ServiceCalculatorToggle({
  serviceId,
  initialEnabled,
  initialNoCharge,
  initialRequiresQuote,
}: {
  serviceId: string;
  initialEnabled: boolean;
  initialNoCharge: boolean;
  initialRequiresQuote: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [noCharge, setNoCharge] = useState(initialNoCharge);
  const [requiresQuote, setRequiresQuote] = useState(initialRequiresQuote);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="accent-brand"
          checked={requiresQuote}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setRequiresQuote(next);
            startTransition(() => setServiceRequiresQuoteAction(serviceId, next));
          }}
        />
        We will check the quote and provide a price (deposit is taken once the price is confirmed)
      </label>
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
        Ask customers how many of each room
      </label>
      {enabled && (
        <label className="ml-6 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="accent-brand"
            checked={noCharge}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              setNoCharge(next);
              startTransition(() => setServiceRoomsNoChargeAction(serviceId, next));
            }}
          />
          Room counts are information only, no charge (for the cleaner, like a walkthrough)
        </label>
      )}
    </div>
  );
}
