"use client";

import { useState, useTransition } from "react";
import { createRoomTypeAction, deleteRoomTypeAction } from "@/lib/actions/admin";
import { formatPence } from "@/lib/format";
import type { CalculatorRoomType } from "@/lib/types";

export function RoomTypesManager({ roomTypes }: { roomTypes: CalculatorRoomType[] }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [minutes, setMinutes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!name.trim() || !price) return;
    setError(null);
    startTransition(async () => {
      try {
        await createRoomTypeAction(name.trim(), Math.round(Number(price) * 100), minutes ? Number(minutes) : 0);
        setName("");
        setPrice("");
        setMinutes("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add that room type");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold text-foreground">Pricing calculator room types</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Shared across every service with the calculator turned on — e.g. Bedroom, Bathroom, Living Room.
      </p>

      <div className="mt-3 space-y-2">
        {roomTypes.map((rt) => (
          <div key={rt.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span>
              {rt.name}{" "}
              <span className="text-muted-foreground">
                — {formatPence(rt.price_per_unit_pence)} each
                {rt.minutes_per_unit > 0 ? `, +${rt.minutes_per_unit} min each` : ""}
              </span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => deleteRoomTypeAction(rt.id))}
              className="text-xs text-danger hover:underline disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        ))}
        {roomTypes.length === 0 && <p className="text-sm text-muted-foreground">No room types yet.</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bedroom"
            className="mt-1 block w-40 rounded-lg border border-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Price per unit (£)
          <input
            type="number"
            min={0}
            step={0.01}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 block w-28 rounded-lg border border-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Extra minutes per unit
          <input
            type="number"
            min={0}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="0"
            className="mt-1 block w-28 rounded-lg border border-border px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={pending || !name.trim() || !price}
          onClick={handleAdd}
          className="rounded-lg bg-muted px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        >
          Add room type
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
