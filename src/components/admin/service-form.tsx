"use client";

import { useState, useTransition } from "react";
import { createServiceAction, updateServiceAction } from "@/lib/actions/admin";
import type { Service } from "@/lib/types";

// Explicit text and background colours: inputs inherit colour from the muted label around them, which made typed values look disabled.
const inputClass =
  "mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70";

// One form for adding a service and editing an existing one.
export function ServiceForm({ service, onDone }: { service?: Service; onDone?: () => void }) {
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [price, setPrice] = useState(service ? (service.price_pence / 100).toString() : "");
  const [deposit, setDeposit] = useState(service?.deposit_pence ? (service.deposit_pence / 100).toString() : "");
  const [totalMinutes, setTotalMinutes] = useState(String(service?.duration_minutes ?? 60));
  const [customerMinutes, setCustomerMinutes] = useState(
    service?.customer_duration_minutes ? String(service.customer_duration_minutes) : ""
  );
  const [bufferBefore, setBufferBefore] = useState(String(service?.buffer_before_minutes ?? 0));
  const [bufferAfter, setBufferAfter] = useState(String(service?.buffer_after_minutes ?? 15));
  const [requiresQuote, setRequiresQuote] = useState(service?.requires_quote ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const input = {
      name,
      description: description || undefined,
      durationMinutes: Number(totalMinutes),
      customerDurationMinutes: customerMinutes ? Number(customerMinutes) : null,
      bufferBeforeMinutes: Number(bufferBefore),
      bufferAfterMinutes: Number(bufferAfter),
      pricePence: Math.round(Number(price || 0) * 100),
      depositPence: deposit ? Math.round(Number(deposit) * 100) : null,
      requiresQuote,
    };
    startTransition(async () => {
      try {
        if (service) {
          await updateServiceAction(service.id, input);
          setSaved(true);
          onDone?.();
        } else {
          await createServiceAction(input);
          setName("");
          setDescription("");
          setPrice("");
          setDeposit("");
          setCustomerMinutes("");
          setRequiresQuote(false);
          setSaved(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the service");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Standard Clean)"
        aria-label="Service name"
        className={inputClass}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        aria-label="Description"
        className={inputClass}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Price (£). Enter 0 to show it to customers as Free
          <input type="number" required min={0} step={0.01} value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
        </label>
        <label className="text-xs text-muted-foreground">
          Deposit (£, optional, leave blank for full payment)
          <input type="number" min={0} step={0.01} value={deposit} onChange={(e) => setDeposit(e.target.value)} className={inputClass} />
        </label>
        <label className="text-xs text-muted-foreground">
          Total time in the diary (minutes)
          <input type="number" required min={5} step={5} value={totalMinutes} onChange={(e) => setTotalMinutes(e.target.value)} className={inputClass} />
        </label>
        <label className="text-xs text-muted-foreground">
          Time shown to customers (minutes, optional)
          <input type="number" min={5} step={5} value={customerMinutes} onChange={(e) => setCustomerMinutes(e.target.value)} placeholder="Same as total" className={inputClass} />
        </label>
        <label className="text-xs text-muted-foreground">
          Buffer before (minutes)
          <input type="number" min={0} step={5} value={bufferBefore} onChange={(e) => setBufferBefore(e.target.value)} className={inputClass} />
        </label>
        <label className="text-xs text-muted-foreground">
          Buffer after, travel time (minutes)
          <input type="number" min={0} step={5} value={bufferAfter} onChange={(e) => setBufferAfter(e.target.value)} className={inputClass} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        The total time is what gets blocked in the diary, so include travel or set up. Customers only see the time shown
        to them, for example a walkthrough that takes 20 minutes with the customer but blocks 45.
      </p>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" className="mt-1 accent-brand" checked={requiresQuote} onChange={(e) => setRequiresQuote(e.target.checked)} />
        <span>
          We will check the quote and provide a price
          <span className="block text-xs text-muted-foreground">
            Customers are told you will be in contact with an exact price and pay nothing when they book. You confirm the
            price, then the cleaner and customer are told. Any deposit is taken once the price is confirmed.
          </span>
        </span>
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-success">Saved.</p>}
      <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60">
        {pending ? "Saving…" : service ? "Save changes" : "Add service"}
      </button>
    </form>
  );
}
