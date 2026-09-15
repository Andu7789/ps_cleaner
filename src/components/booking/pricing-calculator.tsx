"use client";

import { formatPence } from "@/lib/format";
import type { CalculatorRoomType } from "@/lib/types";

export function PricingCalculator({
  roomTypes,
  quantities,
  onChange,
}: {
  roomTypes: CalculatorRoomType[];
  quantities: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  function setQuantity(id: string, value: number) {
    onChange({ ...quantities, [id]: Math.max(0, Math.min(20, value)) });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {roomTypes.map((rt) => {
        const qty = quantities[rt.id] ?? 0;
        return (
          <div key={rt.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">{rt.name}</p>
              <p className="text-xs text-muted-foreground">{formatPence(rt.price_per_unit_pence)} each</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity(rt.id, qty - 1)}
                disabled={qty <= 0}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground disabled:opacity-40"
                aria-label={`Fewer ${rt.name}`}
              >
                &minus;
              </button>
              <span className="w-4 text-center text-sm font-medium text-foreground">{qty}</span>
              <button
                type="button"
                onClick={() => setQuantity(rt.id, qty + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground"
                aria-label={`More ${rt.name}`}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
